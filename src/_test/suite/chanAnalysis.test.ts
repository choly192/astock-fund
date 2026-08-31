import * as assert from 'assert';
import {
  analyzeChan,
  buildChanStrokes,
  ChanFractal,
  detectChanFractals,
  detectChanSignals,
  findChanCenters,
  mergeIncludedBars,
} from '../../chan/engine';
import { StockChartPoint } from '../../shared/stockChartProtocol';
import { buildChanSignalSeriesData } from '../../chan/seriesData';

function point(time: number, high: number, low: number, close = (high + low) / 2): StockChartPoint {
  return { time, open: close, high, low, close, volume: 1 };
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
    assert.equal(data[1].signals[0], signal);
  });
});
