import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawnSync } from 'child_process';
import { analyzeChan } from '../../chan/engine';
import {
  classifyMarketRegime,
  parseChanValidationDatasets,
  replayChanAnalysis,
  runChanValidation,
} from '../../chan/validation';
import { StockChartPoint } from '../../shared/stockChartProtocol';
import { trimInvalidAdjustedHistory } from '../../chan/fetchValidationDataCli';

const projectRoot = path.resolve(__dirname, '../../..');
const validationCli = path.join(projectRoot, 'out', 'chan', 'validationCli.js');

function validationPoints(): StockChartPoint[] {
  const anchors = [10, 8, 12, 9, 11, 7, 9, 6.5, 10, 7.2, 10.5, 9];
  const points: StockChartPoint[] = [];
  for (let segment = 0; segment < anchors.length - 1; segment += 1) {
    for (let offset = 0; offset < 4; offset += 1) {
      const value = anchors[segment]
        + (anchors[segment + 1] - anchors[segment]) * offset / 4;
      points.push({
        time: points.length + 1,
        open: value - 0.05,
        high: value + 0.2,
        low: value - 0.2,
        close: value + 0.05,
        volume: 1000 + points.length,
      });
    }
  }
  let tail = anchors[anchors.length - 1];
  while (points.length < 80) {
    tail -= 0.001;
    points.push({
      time: points.length + 1,
      open: tail - 0.05,
      high: tail + 0.2,
      low: tail - 0.2,
      close: tail + 0.05,
      volume: 1000 + points.length,
    });
  }
  return points;
}

suite('Chan algorithm validation', () => {
  test('trims invalid leading adjusted prices from collected history', () => {
    const points = validationPoints().slice(0, 3);
    assert.deepStrictEqual(trimInvalidAdjustedHistory([
      { ...points[0], open: -1, low: -1 },
      ...points.slice(1),
    ]), points.slice(1));
  });

  test('discovers signals only when their confirmation bar is available', () => {
    const points = validationPoints();
    const replay = replayChanAnalysis(points);

    assert.deepStrictEqual(
      replay.signals.map(({ side, level }) => ({ side, level })),
      [{ side: 'buy', level: 1 }, { side: 'buy', level: 2 }]
    );
    replay.signals.forEach((signal) => {
      assert.equal(signal.firstSeenIndex, signal.confirmedIndex);
      assert.equal(signal.confirmationLagBars, 0);
      assert.ok(signal.firstSeenTime !== signal.time);
      assert.ok(!analyzeChan(points.slice(0, signal.firstSeenIndex)).signals
        .some((item) => item.id === signal.id));
      assert.ok(analyzeChan(points.slice(0, signal.firstSeenIndex + 1)).signals
        .some((item) => item.id === signal.id));
    });
    assert.deepStrictEqual(replay.stabilityViolations, []);
  });

  test('evaluates the next bar and applies round-trip costs', () => {
    const points = validationPoints();
    const report = runChanValidation([{
      symbol: 'fixture',
      period: 'day',
      points,
    }], {
      horizons: [1, 5],
      feeBps: 3,
      slippageBps: 2,
    });

    assert.deepStrictEqual(report.options.horizons, [1, 5]);
    assert.equal(report.summary.signalCount, 2);
    assert.equal(report.summary.stabilityViolationCount, 0);
    assert.equal(report.summary.tradeEvaluationCount, 4);
    assert.ok(Array.isArray(report.variantMetrics));
    assert.ok(Array.isArray(report.opportunityCoverage));
    report.datasets[0].trades.forEach((trade) => {
      assert.equal(trade.entryIndex, trade.availableIndex + 1);
      assert.equal(trade.sample, 'development');
      assert.ok(trade.netReturn < trade.grossReturn);
      assert.ok(trade.mfe >= trade.mae);
    });
    const overall = report.metrics.find((metric) =>
      metric.group === 'all' && metric.horizon === 5
    );
    assert.equal(overall?.tradeCount, 2);
    assert.ok(report.metricSlices.some((metric) =>
      metric.sample === 'development' && metric.group === 'buy:1'
    ));
    assert.equal(report.ruleDiagnostics.length, 12);
    report.ruleDiagnostics.forEach((diagnostic) => {
      assert.ok(Array.isArray(diagnostic.draggingPeriods));
      assert.ok(Array.isArray(diagnostic.draggingRegimes));
    });
  });

  test('classifies regimes with trailing data only', () => {
    const rising = Array.from({ length: 100 }, (_value, index) => ({
      time: index + 1,
      open: 10 + index * 0.1,
      high: 10.2 + index * 0.1,
      low: 9.8 + index * 0.1,
      close: 10 + index * 0.1,
      volume: 1000,
    }));
    const options = {
      regimeMaBars: 20,
      regimeSlopeBars: 10,
      regimeThreshold: 0.005,
    };
    assert.equal(classifyMarketRegime(rising, 10, options), 'sideways');
    assert.equal(classifyMarketRegime(rising, 99, options), 'bull');
    const changedFuture = [...rising, {
      time: 101, open: 1, high: 1, low: 1, close: 1, volume: 1000,
    }];
    assert.equal(classifyMarketRegime(changedFuture, 99, options), 'bull');
  });

  test('rejects malformed or unordered K-line datasets', () => {
    const points = validationPoints().slice(0, 3);
    assert.throws(() => parseChanValidationDatasets({
      symbol: 'fixture',
      period: 'trend',
      points,
    }), /不是支持的 K 线周期/);
    assert.throws(() => parseChanValidationDatasets({
      symbol: 'fixture',
      period: 'day',
      points: [points[1], points[0]],
    }), /必须严格递增/);
    assert.throws(() => parseChanValidationDatasets({
      symbol: 'fixture',
      period: 'day',
      points: [{ ...points[0], high: points[0].low - 1 }],
    }), /OHLC 不一致/);
  });

  test('produces a deterministic JSON report through the CLI', () => {
    const inputPath = path.join(os.tmpdir(), `stock-eagle-eye-chan-input-${process.pid}.json`);
    const firstOutput = path.join(os.tmpdir(), `stock-eagle-eye-chan-report-a-${process.pid}.json`);
    const secondOutput = path.join(os.tmpdir(), `stock-eagle-eye-chan-report-b-${process.pid}.json`);
    fs.writeFileSync(inputPath, JSON.stringify({
      datasets: [{ symbol: 'fixture', period: 'day', points: validationPoints() }],
    }), 'utf8');

    try {
      const args = [
        validationCli,
        '--input', inputPath,
        '--horizons', '1,5',
        '--fee-bps', '3',
        '--slippage-bps', '2',
      ];
      const first = spawnSync(process.execPath, [...args, '--output', firstOutput], {
        cwd: projectRoot,
        encoding: 'utf8',
      });
      const second = spawnSync(process.execPath, [...args, '--output', secondOutput], {
        cwd: projectRoot,
        encoding: 'utf8',
      });
      assert.equal(first.status, 0, first.stderr);
      assert.equal(second.status, 0, second.stderr);
      assert.equal(fs.readFileSync(firstOutput, 'utf8'), fs.readFileSync(secondOutput, 'utf8'));
      const report = JSON.parse(fs.readFileSync(firstOutput, 'utf8'));
      assert.equal(report.schemaVersion, '1.2.0');
      assert.equal(report.summary.signalCount, 2);
      const positional = spawnSync(process.execPath, [
        validationCli,
        inputPath,
        secondOutput,
        '1,5',
        '3',
        '2',
      ], {
        cwd: projectRoot,
        encoding: 'utf8',
      });
      assert.equal(positional.status, 0, positional.stderr);
    } finally {
      [inputPath, firstOutput, secondOutput].forEach((file) => {
        if (fs.existsSync(file)) fs.unlinkSync(file);
      });
    }
  });
});
