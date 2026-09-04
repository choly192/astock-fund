import * as assert from 'assert';
import {
  analyzeChan,
  buildChanStrokes,
  ChanFractal,
  detectChanSignalMatches,
  detectChanFractals,
  detectChanSignals,
  detectTdxMultiscaleSignals,
  findChanCenters,
  mergeIncludedBars,
} from '../../chan/engine';
import { StockChartPoint } from '../../shared/stockChartProtocol';
import { buildChanSignalSeriesData } from '../../chan/seriesData';
import {
  analyzeTdxMultiscale,
  detectCausalZigZag,
  getTdxReversalRatios,
} from '../../chan/tdxMultiscale';

function point(time: number, high: number, low: number, close = (high + low) / 2): StockChartPoint {
  return { time, open: close, high, low, close, volume: 1 };
}

function closePoints(closes: readonly number[]): StockChartPoint[] {
  return closes.map((close, index) => point(index, close, close, close));
}

function fractal(type: ChanFractal['type'], sequence: number, price: number): ChanFractal {
  const index = sequence * 4;
  return {
    type,
    index,
    sourceIndex: index,
    time: index,
    price,
    confirmedIndex: index + 1,
    confirmedTime: index + 1,
    firstConfirmedIndex: index + 1,
    firstConfirmedTime: index + 1,
  };
}

function strokesFrom(startType: ChanFractal['type'], prices: number[]) {
  return buildChanStrokes(prices.map((price, index) => fractal(
    index % 2 === 0 ? startType : startType === 'top' ? 'bottom' : 'top',
    index,
    price
  )));
}

suite('Chan analysis', () => {
  test('merges containing K-lines in the established direction', () => {
    const merged = mergeIncludedBars([
      point(0, 8, 4),
      point(1, 10, 6),
      point(2, 9, 7),
      point(3, 12, 8),
    ]);
    assert.equal(merged.length, 3);
    assert.deepStrictEqual(
      { high: merged[1].high, low: merged[1].low, volume: merged[1].volume },
      { high: 10, low: 7, volume: 2 }
    );
    assert.equal(merged[1].sourceStartIndex, 1);
    assert.equal(merged[1].sourceEndIndex, 2);
  });

  test('keeps a fractal confirmation fixed when the stabilizer bar extends', () => {
    const initial = [
      point(0, 8, 4),
      point(1, 10, 6),
      point(2, 9, 5),
      point(3, 7, 3),
    ];
    const beforeExtension = detectChanFractals(mergeIncludedBars(initial));
    const afterExtension = detectChanFractals(mergeIncludedBars([
      ...initial,
      point(4, 6, 4),
    ]));

    assert.equal(beforeExtension[0].confirmedIndex, 3);
    assert.equal(beforeExtension[0].confirmedTime, 3);
    assert.equal(afterExtension[0].confirmedIndex, 3);
    assert.equal(afterExtension[0].confirmedTime, 3);
  });

  test('confirms first and second buy points only after a guard stroke', () => {
    const strokes = strokesFrom('bottom', [8, 12, 9, 11, 7, 9, 6.5, 10, 7.2, 10.5]);

    const beforeFirstGuard = strokes.slice(0, 6);
    assert.deepStrictEqual(
      detectChanSignals(beforeFirstGuard, findChanCenters(beforeFirstGuard.slice(0, -1))),
      []
    );

    const withFirstGuard = strokes.slice(0, 7);
    const firstSignals = detectChanSignals(
      withFirstGuard,
      findChanCenters(withFirstGuard.slice(0, -1))
    );
    assert.deepStrictEqual(firstSignals.map(({ side, level, strokeIndex }) => ({
      side, level, strokeIndex,
    })), [{ side: 'buy', level: 1, strokeIndex: 5 }]);

    const completeSignals = detectChanSignals(strokes, findChanCenters(strokes.slice(0, -1)));
    assert.deepStrictEqual(completeSignals.map(({ side, level, strokeIndex }) => ({
      side, level, strokeIndex,
    })), [
      { side: 'buy', level: 1, strokeIndex: 5 },
      { side: 'buy', level: 2, strokeIndex: 7 },
    ]);
    assert.ok(completeSignals[0].confirmedIndex <= completeSignals[1].confirmedIndex);
    const centers = findChanCenters(strokes.slice(0, -1));
    completeSignals.filter((signal) => signal.level === 1).forEach((signal) => {
      const center = [...centers].reverse()
        .find((item) => item.endStrokeIndex < signal.strokeIndex);
      assert.ok(center && signal.strokeIndex - center.endStrokeIndex <= 3);
    });
  });

  test('detects confirmed third buy and sell retests outside a center', () => {
    const buyStrokes = strokesFrom('top', [12, 8, 11, 9, 13, 11.5, 14]);
    const buySignals = detectChanSignals(
      buyStrokes,
      findChanCenters(buyStrokes.slice(0, -1))
    );
    assert.ok(buySignals.some((signal) => signal.side === 'buy' && signal.level === 3));

    const sellStrokes = strokesFrom('bottom', [8, 12, 9, 11, 7, 8.5, 6]);
    const sellSignals = detectChanSignals(
      sellStrokes,
      findChanCenters(sellStrokes.slice(0, -1))
    );
    assert.ok(sellSignals.some((signal) => signal.side === 'sell' && signal.level === 3));
  });

  test('adds stable local buy points only in validated weekly regimes', () => {
    const divergence = [10, 11, 12, 11, 10, 8, 9, 10, 11, 10, 9, 8.5, 8, 7.8, 8, 8.5]
      .map((value, index) => point(index, value + 0.1, value - 0.1, value));
    const weekSignals = analyzeChan(divergence, { period: 'week' }).signals;
    assert.ok(weekSignals.some((signal) =>
      signal.side === 'buy'
      && signal.level === 1
      && signal.variant === 'local-divergence'
    ));
    assert.ok(!analyzeChan(divergence, { period: 'day' }).signals
      .some((signal) => signal.variant === 'local-divergence'));

    const bullPrefix = Array.from({ length: 90 }, (_value, index) => 10 + index * 0.1);
    const secondBuy = [...bullPrefix, 18, 19, 20, 19, 18.5, 18, 19, 20.5, 22, 21, 20.5, 20, 19.8, 19.5, 20, 20.5]
      .map((value, index) => point(index, value + 0.1, value - 0.1, value));
    assert.ok(analyzeChan(secondBuy, { period: 'week' }).signals.some((signal) =>
      signal.side === 'buy'
      && signal.level === 2
      && signal.variant === 'local-second'
    ));
    assert.ok(!analyzeChan(secondBuy, { period: 'day' }).signals
      .some((signal) => signal.variant === 'local-second'));

    const bearPrefix = Array.from({ length: 90 }, (_value, index) => 30 - index * 0.1);
    const bearDivergence = [...bearPrefix, 22, 23, 24, 23, 22, 20, 21, 22, 23, 22, 21, 20.5, 20, 19.8, 20, 20.5]
      .map((value, index) => point(index, value + 0.1, value - 0.1, value));
    assert.ok(!analyzeChan(bearDivergence, { period: 'week' }).signals
      .some((signal) => signal.variant === 'local-divergence'));
  });

  test('keeps every matching rule before display-level event deduplication', () => {
    const points = [10, 11, 12, 11, 10, 8, 9, 10, 11, 10, 9, 8.5, 8, 7.8, 8, 8.5]
      .map((value, index) => point(index, value + 0.1, value - 0.1, value));
    const fractals = [8, 12, 9, 11, 7, 9, 6.5, 10]
      .map((price, index) => fractal(index % 2 === 0 ? 'bottom' : 'top', index, price));
    fractals[6] = { ...fractals[6], time: 13 };
    const strokes = buildChanStrokes(fractals);
    const matches = detectChanSignalMatches(
      strokes,
      findChanCenters(strokes.slice(0, -1)),
      points,
      'week'
    ).filter((signal) => signal.time === 13 && signal.side === 'buy' && signal.level === 1);

    assert.deepStrictEqual(
      matches.map((signal) => signal.variant).sort(),
      ['local-divergence', 'standard']
    );
    assert.equal(detectChanSignals(
      strokes,
      findChanCenters(strokes.slice(0, -1)),
      points,
      'week'
    ).filter((signal) => signal.time === 13).length, 1);
  });

  test('confirms causal ZigZag pivots only after the required reversal', () => {
    const beforeTopConfirmation = closePoints([100, 105, 121]);
    const initialPivots = detectCausalZigZag(beforeTopConfirmation, 0.1);
    assert.deepStrictEqual(initialPivots.map(({ type, index, confirmedIndex }) => ({
      type, index, confirmedIndex,
    })), [{ type: 'bottom', index: 0, confirmedIndex: 2 }]);

    const confirmed = detectCausalZigZag(
      closePoints([100, 105, 121, 108]),
      0.1
    );
    assert.deepStrictEqual(confirmed.map(({ type, index, confirmedIndex }) => ({
      type, index, confirmedIndex,
    })), [
      { type: 'bottom', index: 0, confirmedIndex: 2 },
      { type: 'top', index: 2, confirmedIndex: 3 },
    ]);

    const extended = detectCausalZigZag(
      closePoints([100, 105, 121, 108, 140, 130]),
      0.1
    );
    assert.deepStrictEqual(extended.slice(0, confirmed.length), confirmed);
    assert.throws(() => detectCausalZigZag(beforeTopConfirmation, 0), /reversalRatio/);
  });

  test('maps confirmed multi-scale turns to separate TDX signal variants', () => {
    const points = closePoints([100, 80, 90, 75, 95, 110, 97, 112, 80, 90, 75]);
    const analysis = analyzeTdxMultiscale(points, 'day');

    assert.ok(analysis.smallPivots.length >= analysis.mediumPivots.length);
    assert.ok(analysis.mediumPivots.length >= analysis.largePivots.length);
    assert.deepStrictEqual(
      analysis.signals.map(({ side, level, variant, pivotIndex, confirmedIndex }) => ({
        side, level, variant, pivotIndex, confirmedIndex,
      })),
      [
        { side: 'buy', level: 2, variant: 'tdx-class-two', pivotIndex: 1, confirmedIndex: 2 },
        { side: 'sell', level: 2, variant: 'tdx-multiscale', pivotIndex: 2, confirmedIndex: 3 },
        { side: 'buy', level: 1, variant: 'tdx-multiscale', pivotIndex: 3, confirmedIndex: 4 },
        { side: 'sell', level: 2, variant: 'tdx-class-two', pivotIndex: 5, confirmedIndex: 6 },
        { side: 'buy', level: 2, variant: 'tdx-multiscale', pivotIndex: 6, confirmedIndex: 7 },
        { side: 'sell', level: 1, variant: 'tdx-multiscale', pivotIndex: 7, confirmedIndex: 8 },
        { side: 'buy', level: 2, variant: 'tdx-class-two', pivotIndex: 8, confirmedIndex: 9 },
        { side: 'sell', level: 2, variant: 'tdx-multiscale', pivotIndex: 9, confirmedIndex: 10 },
      ]
    );
    analysis.signals.forEach((signal) => {
      assert.ok(signal.confirmedIndex > signal.pivotIndex);
      const firstVisible = analyzeTdxMultiscale(
        points.slice(0, signal.confirmedIndex + 1),
        'day'
      ).signals;
      assert.ok(firstVisible.some((candidate) =>
        candidate.time === signal.time
        && candidate.side === signal.side
        && candidate.level === signal.level
        && candidate.variant === signal.variant
      ));
    });
  });

  test('keeps TDX multi-scale signals behind the experiment switch on supported periods', () => {
    const points = closePoints([100, 80, 90, 75, 95, 110, 97, 112]);
    assert.deepStrictEqual(
      analyzeChan(points, { period: 'day' }).signals
        .filter((signal) => signal.variant.startsWith('tdx-')),
      []
    );
    assert.ok(analyzeChan(points, { period: 'day', enableTdxMultiscale: true }).signals
      .some((signal) => signal.variant === 'tdx-multiscale'));
    assert.ok(detectTdxMultiscaleSignals(points, '60m').length > 0);
    assert.deepStrictEqual(detectTdxMultiscaleSignals(points, 'month'), []);
  });

  test('uses period-specific reversal ratios for minute TDX signals', () => {
    assert.deepStrictEqual(getTdxReversalRatios('day'), {
      small: 0.05,
      medium: 0.1,
      large: 0.2,
    });
    assert.deepStrictEqual(getTdxReversalRatios('5m'), {
      small: 0.003,
      medium: 0.006,
      large: 0.012,
    });
    assert.deepStrictEqual(getTdxReversalRatios('60m'), {
      small: 0.01,
      medium: 0.02,
      large: 0.04,
    });
    assert.equal(getTdxReversalRatios('month'), undefined);

    const minuteSignals = analyzeTdxMultiscale(
      closePoints([100, 98, 99, 97, 99, 101, 99, 101]),
      '5m'
    ).signals;
    assert.ok(minuteSignals.some((signal) =>
      signal.variant === 'tdx-multiscale' && signal.reason.includes('1.2%')
    ));
    assert.ok(minuteSignals.some((signal) =>
      signal.variant === 'tdx-class-two' && signal.reason.includes('0.6%')
    ));
  });

  test('binds signals to the matching chart time', () => {
    const points = [point(1, 11, 9), point(2, 12, 10), point(3, 13, 11)];
    const signal = {
      id: '2:buy:1',
      side: 'buy' as const,
      level: 1 as const,
      variant: 'standard' as const,
      time: 2,
      price: 10,
      strokeIndex: 5,
      confirmedIndex: 3,
      confirmedTime: 3,
      reason: '测试信号',
      algorithmVersion: '1.0.0',
    };
    const data = buildChanSignalSeriesData(points, [signal]);
    assert.deepStrictEqual(data.map((item) => item.signals.length), [0, 1, 0]);
    assert.deepStrictEqual(data.map((item) => item.confirmations.length), [0, 0, 1]);
    assert.equal(data[1].signals[0], signal);
    assert.equal(data[2].confirmations[0], signal);
  });
});
