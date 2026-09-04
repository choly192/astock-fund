import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawnSync } from 'child_process';
import { analyzeChan } from '../../chan/engine';
import {
  classifyMarketRegime,
  evaluateChanSignals,
  inferChanAssetType,
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

function tdxValidationPoints(): StockChartPoint[] {
  return [100, 80, 90, 75, 95, 110, 97, 112, 80, 90, 75, 96, 82, 105]
    .map((close, index) => ({
      time: index + 1,
      open: close,
      high: close,
      low: close,
      close,
      volume: 1000,
    }));
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
    assert.ok(replay.ruleSignals.length >= replay.signals.length);
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

  test('replays the optional TDX signals without future or mutation violations', () => {
    const points = tdxValidationPoints();
    const defaultReplay = replayChanAnalysis(points, 'day');
    assert.ok(!defaultReplay.ruleSignals.some((signal) => signal.variant.startsWith('tdx-')));

    const replay = replayChanAnalysis(points, 'day', { enableTdxMultiscale: true });
    const tdxSignals = replay.ruleSignals.filter((signal) => signal.variant.startsWith('tdx-'));
    assert.ok(tdxSignals.length > 0);
    tdxSignals.forEach((signal) => {
      assert.equal(signal.firstSeenIndex, signal.confirmedIndex);
      assert.equal(signal.confirmationLagBars, 0);
      assert.ok(signal.confirmedIndex > points.findIndex((point) => point.time === signal.time));
    });
    assert.deepStrictEqual(replay.stabilityViolations, []);

    const report = runChanValidation([{
      symbol: 'fixture-tdx',
      period: 'day',
      points,
    }], {
      horizons: [1],
      enableTdxMultiscale: true,
    });
    assert.equal(report.options.enableTdxMultiscale, true);
    assert.ok(report.variantMetrics.some((metric) =>
      metric.variant === 'tdx-multiscale' && metric.tradeCount > 0
    ));
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
      sellTaxBps: 5,
      slippageBps: 2,
    });

    assert.deepStrictEqual(report.options.horizons, [1, 5]);
    assert.equal(report.summary.signalCount, 2);
    assert.equal(report.summary.stabilityViolationCount, 0);
    assert.equal(report.summary.tradeEvaluationCount, 4);
    assert.ok(report.summary.ruleSignalCount >= report.summary.signalCount);
    assert.ok(report.summary.ruleTradeEvaluationCount >= report.summary.tradeEvaluationCount);
    assert.ok(Array.isArray(report.variantMetrics));
    assert.ok(Array.isArray(report.opportunityCoverage));
    assert.ok(Array.isArray(report.variantOpportunityCoverage));
    assert.equal(report.opportunitySensitivity.length, 9);
    report.datasets[0].trades.forEach((trade) => {
      assert.equal(trade.entryIndex, trade.availableIndex + 1);
      assert.equal(trade.sample, 'development');
      assert.ok(trade.netReturn < trade.grossReturn);
      assert.equal(trade.returnMode, 'long');
      assert.equal(trade.roundTripCostBps, 11);
      assert.ok(trade.mfe >= trade.mae);
    });
    const overall = report.metrics.find((metric) =>
      metric.group === 'all' && metric.horizon === 5
    );
    assert.equal(overall?.tradeCount, 2);
    assert.equal(typeof overall?.sequentialSignalDrawdown, 'number');
    assert.equal(typeof overall?.worstDatasetSignalDrawdown, 'number');
    assert.ok(report.metricSlices.some((metric) =>
      metric.sample === 'development' && metric.group === 'buy:1'
    ));
    assert.equal(report.ruleDiagnostics.length, 12);
    report.ruleDiagnostics.forEach((diagnostic) => {
      assert.ok(Array.isArray(diagnostic.draggingPeriods));
      assert.ok(Array.isArray(diagnostic.draggingRegimes));
    });
  });

  test('treats sell signals as non-executable downside follow-through', () => {
    const points = validationPoints();
    const signal = {
      algorithmVersion: 'test',
      id: 'sell-signal',
      side: 'sell' as const,
      level: 1 as const,
      variant: 'standard' as const,
      time: points[1].time,
      price: points[1].close,
      strokeIndex: 1,
      confirmedIndex: 1,
      confirmedTime: points[1].time,
      reason: '测试卖点',
      firstSeenIndex: 1,
      firstSeenTime: points[1].time,
      confirmationLagBars: 0,
    };
    const trades = evaluateChanSignals({
      symbol: 'sh600000',
      period: 'day',
      assetType: 'stock',
      points,
    }, {
      algorithmVersion: 'test',
      barCount: points.length,
      signals: [signal],
      ruleSignals: [signal],
      stabilityViolations: [],
    }, { horizons: [1] });

    assert.equal(trades.length, 1);
    assert.equal(trades[0].returnMode, 'downside-follow-through');
    assert.equal(trades[0].executable, false);
    assert.equal(trades[0].roundTripCostBps, 0);
    assert.equal(trades[0].netReturn, trades[0].grossReturn);
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
    assert.throws(() => parseChanValidationDatasets({
      symbol: 'fixture',
      period: 'day',
      assetType: 'crypto',
      points,
    }), /不是支持的资产类型/);
    assert.equal(inferChanAssetType('sh000300'), 'index');
    assert.equal(inferChanAssetType('sz000001'), 'stock');
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
        '--sell-tax-bps', '5',
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
      assert.equal(report.schemaVersion, '1.4.0');
      assert.equal(report.summary.signalCount, 2);
      const positional = spawnSync(process.execPath, [
        validationCli,
        inputPath,
        secondOutput,
        '1,5',
        '3',
        '2',
        '5',
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
