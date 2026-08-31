import { StockChartPeriod, StockChartPoint } from '../shared/stockChartProtocol';
import {
  classifyMarketRegime,
  DEFAULT_CHAN_MARKET_REGIME_OPTIONS,
} from './marketRegime';

export const CHAN_ALGORITHM_VERSION = '1.0.5';

export type ChanDirection = 'up' | 'down';
export type ChanFractalType = 'top' | 'bottom';
export type ChanSignalSide = 'buy' | 'sell';
export type ChanSignalLevel = 1 | 2 | 3;
export type ChanSignalVariant = 'standard' | 'local-divergence' | 'local-second';
export type ChanTime = StockChartPoint['time'];

export interface ChanAnalysisOptions {
  period?: StockChartPeriod;
}

export interface ChanMergedBar extends StockChartPoint {
  sourceStartIndex: number;
  sourceStartTime: ChanTime;
  sourceEndIndex: number;
}

export interface ChanFractal {
  type: ChanFractalType;
  index: number;
  sourceIndex: number;
  time: ChanTime;
  price: number;
  confirmedIndex: number;
  confirmedTime: ChanTime;
  firstConfirmedIndex: number;
  firstConfirmedTime: ChanTime;
}

export interface ChanStroke {
  index: number;
  direction: ChanDirection;
  start: ChanFractal;
  end: ChanFractal;
  high: number;
  low: number;
  amplitude: number;
  span: number;
}

export interface ChanSegment {
  index: number;
  direction: ChanDirection;
  startStrokeIndex: number;
  endStrokeIndex: number;
  startPrice: number;
  endPrice: number;
  confirmedTime: ChanTime;
}

export interface ChanCenter {
  index: number;
  startStrokeIndex: number;
  endStrokeIndex: number;
  low: number;
  high: number;
}

export interface ChanSignal {
  id: string;
  side: ChanSignalSide;
  level: ChanSignalLevel;
  variant: ChanSignalVariant;
  time: ChanTime;
  price: number;
  strokeIndex: number;
  confirmedIndex: number;
  confirmedTime: ChanTime;
  reason: string;
  algorithmVersion: string;
}

export interface ChanAnalysis {
  algorithmVersion: string;
  mergedBars: ChanMergedBar[];
  fractals: ChanFractal[];
  strokes: ChanStroke[];
  stableStrokeCount: number;
  segments: ChanSegment[];
  centers: ChanCenter[];
  signalMatches: ChanSignal[];
  signals: ChanSignal[];
}

function directionBetween(left: ChanMergedBar, right: Pick<StockChartPoint, 'high' | 'low'>): ChanDirection | undefined {
  if (right.high > left.high && right.low > left.low) return 'up';
  if (right.high < left.high && right.low < left.low) return 'down';
  return undefined;
}

function includes(left: Pick<StockChartPoint, 'high' | 'low'>, right: Pick<StockChartPoint, 'high' | 'low'>): boolean {
  return (left.high >= right.high && left.low <= right.low)
    || (right.high >= left.high && right.low <= left.low);
}

export function mergeIncludedBars(points: readonly StockChartPoint[]): ChanMergedBar[] {
  const result: ChanMergedBar[] = [];
  let direction: ChanDirection | undefined;

  points.forEach((point, sourceIndex) => {
    const current: ChanMergedBar = {
      ...point,
      sourceStartIndex: sourceIndex,
      sourceStartTime: point.time,
      sourceEndIndex: sourceIndex,
    };
    const last = result[result.length - 1];
    if (!last) {
      result.push(current);
      return;
    }

    if (!includes(last, current)) {
      direction = directionBetween(last, current) ?? direction;
      result.push(current);
      return;
    }

    const previous = result[result.length - 2];
    const mergeDirection = direction
      ?? (previous ? directionBetween(previous, last) : undefined)
      ?? (current.close >= last.close ? 'up' : 'down');
    result[result.length - 1] = {
      ...last,
      time: current.time,
      high: mergeDirection === 'up'
        ? Math.max(last.high, current.high)
        : Math.min(last.high, current.high),
      low: mergeDirection === 'up'
        ? Math.max(last.low, current.low)
        : Math.min(last.low, current.low),
      close: current.close,
      volume: last.volume + current.volume,
      sourceEndIndex: sourceIndex,
    };
    direction = mergeDirection;
  });

  return result;
}

function isMoreExtreme(candidate: ChanFractal, current: ChanFractal): boolean {
  return candidate.type === 'top'
    ? candidate.price >= current.price
    : candidate.price <= current.price;
}

export function detectChanFractals(
  bars: readonly ChanMergedBar[],
  minimumSpan = 3
): ChanFractal[] {
  const candidates: ChanFractal[] = [];
  for (let index = 1; index < bars.length - 2; index += 1) {
    const left = bars[index - 1];
    const middle = bars[index];
    const right = bars[index + 1];
    const stabilizer = bars[index + 2];
    const top = middle.high > left.high && middle.high >= right.high
      && middle.low > left.low && middle.low >= right.low;
    const bottom = middle.low < left.low && middle.low <= right.low
      && middle.high < left.high && middle.high <= right.high;
    if (!top && !bottom) continue;
    const type: ChanFractalType = top ? 'top' : 'bottom';
    candidates.push({
      type,
      index,
      sourceIndex: middle.sourceEndIndex,
      time: middle.time,
      price: type === 'top' ? middle.high : middle.low,
      confirmedIndex: stabilizer.sourceStartIndex,
      confirmedTime: stabilizer.sourceStartTime,
      firstConfirmedIndex: stabilizer.sourceStartIndex,
      firstConfirmedTime: stabilizer.sourceStartTime,
    });
  }

  const confirmed: ChanFractal[] = [];
  candidates.forEach((candidate) => {
    const last = confirmed[confirmed.length - 1];
    if (!last) {
      confirmed.push(candidate);
      return;
    }
    if (candidate.type === last.type) {
      if (isMoreExtreme(candidate, last)) {
        confirmed[confirmed.length - 1] = {
          ...candidate,
          firstConfirmedIndex: last.firstConfirmedIndex,
          firstConfirmedTime: last.firstConfirmedTime,
        };
      }
      return;
    }
    if (candidate.index - last.index >= minimumSpan) confirmed.push(candidate);
  });
  return confirmed;
}

export function buildChanStrokes(fractals: readonly ChanFractal[]): ChanStroke[] {
  const strokes: ChanStroke[] = [];
  for (let index = 1; index < fractals.length; index += 1) {
    const start = fractals[index - 1];
    const end = fractals[index];
    const direction: ChanDirection = start.type === 'bottom' ? 'up' : 'down';
    strokes.push({
      index: strokes.length,
      direction,
      start,
      end,
      high: Math.max(start.price, end.price),
      low: Math.min(start.price, end.price),
      amplitude: Math.abs(end.price - start.price),
      span: Math.max(1, end.index - start.index),
    });
  }
  return strokes;
}

export function buildChanSegments(strokes: readonly ChanStroke[]): ChanSegment[] {
  if (strokes.length < 4) return [];
  const endpoints = strokes.map((stroke) => stroke.end);
  const turns: Array<{ strokeIndex: number; type: ChanFractalType; price: number; confirmedTime: ChanTime }> = [];
  for (let index = 1; index < endpoints.length - 1; index += 1) {
    const previous = endpoints[index - 1].price;
    const current = endpoints[index].price;
    const next = endpoints[index + 1].price;
    const type = current > previous && current >= next
      ? 'top'
      : current < previous && current <= next ? 'bottom' : undefined;
    if (!type) continue;
    const turn: { strokeIndex: number; type: ChanFractalType; price: number; confirmedTime: ChanTime } = {
      strokeIndex: index,
      type,
      price: current,
      confirmedTime: endpoints[index + 1].confirmedTime,
    };
    const last = turns[turns.length - 1];
    if (last?.type === type) {
      const moreExtreme = type === 'top' ? turn.price >= last.price : turn.price <= last.price;
      if (moreExtreme) turns[turns.length - 1] = turn;
    } else if (!last || turn.strokeIndex - last.strokeIndex >= 2) {
      turns.push(turn);
    }
  }

  const segments: ChanSegment[] = [];
  for (let index = 1; index < turns.length; index += 1) {
    const start = turns[index - 1];
    const end = turns[index];
    segments.push({
      index: segments.length,
      direction: start.type === 'bottom' ? 'up' : 'down',
      startStrokeIndex: start.strokeIndex,
      endStrokeIndex: end.strokeIndex,
      startPrice: start.price,
      endPrice: end.price,
      confirmedTime: end.confirmedTime,
    });
  }
  return segments;
}

export function findChanCenters(strokes: readonly ChanStroke[]): ChanCenter[] {
  const centers: ChanCenter[] = [];
  let cursor = 0;
  while (cursor <= strokes.length - 3) {
    const window = strokes.slice(cursor, cursor + 3);
    const low = Math.max(...window.map((stroke) => stroke.low));
    const high = Math.min(...window.map((stroke) => stroke.high));
    if (low >= high) {
      cursor += 1;
      continue;
    }
    let endStrokeIndex = cursor + 2;
    while (endStrokeIndex + 1 < strokes.length) {
      const endpoint = strokes[endStrokeIndex + 1].end.price;
      if (endpoint < low || endpoint > high) break;
      endStrokeIndex += 1;
    }
    centers.push({
      index: centers.length,
      startStrokeIndex: cursor,
      endStrokeIndex,
      low,
      high,
    });
    cursor = endStrokeIndex + 1;
  }
  return centers;
}

function strokeStrength(stroke: ChanStroke): number {
  return stroke.amplitude / stroke.span;
}

const MAX_DIVERGENCE_STRENGTH_RATIO = 0.85;
const MIN_DIVERGENCE_AMPLITUDE_RATIO = 0.5;

interface ChanSignalConfirmation {
  index: number;
  time: ChanTime;
}

function guardStrokeConfirmation(guard: ChanStroke | undefined): ChanSignalConfirmation | undefined {
  return guard ? {
    index: guard.end.firstConfirmedIndex,
    time: guard.end.firstConfirmedTime,
  } : undefined;
}

function createSignal(
  stroke: ChanStroke,
  confirmation: ChanSignalConfirmation,
  side: ChanSignalSide,
  level: ChanSignalLevel,
  reason: string
): ChanSignal {
  return {
    id: `${stroke.end.time}:${side}:${level}`,
    side,
    level,
    variant: 'standard',
    time: stroke.end.time,
    price: stroke.end.price,
    strokeIndex: stroke.index,
    confirmedIndex: confirmation.index,
    confirmedTime: confirmation.time,
    reason,
    algorithmVersion: CHAN_ALGORITHM_VERSION,
  };
}

interface StableLocalPivot {
  type: ChanFractalType;
  index: number;
  time: ChanTime;
  price: number;
}

function detectStableLocalPivots(points: readonly StockChartPoint[]): StableLocalPivot[] {
  const pivots: StableLocalPivot[] = [];
  for (let index = 2; index < points.length - 2; index += 1) {
    const window = points.slice(index - 2, index + 3);
    const point = points[index];
    const top = window.every((item, offset) => offset === 2 || point.high > item.high);
    const bottom = window.every((item, offset) => offset === 2 || point.low < item.low);
    if (top === bottom) continue;
    pivots.push({
      type: top ? 'top' : 'bottom',
      index,
      time: point.time,
      price: top ? point.high : point.low,
    });
  }
  return pivots;
}

function detectLocalDivergenceSignals(
  points: readonly StockChartPoint[] | undefined,
  period: StockChartPeriod | undefined
): ChanSignal[] {
  if (!points?.length || period !== 'week') return [];
  const pivots = detectStableLocalPivots(points);
  const signals: ChanSignal[] = [];
  pivots.forEach((current, pivotIndex) => {
    let previousSameIndex = -1;
    for (let index = pivotIndex - 1; index >= 0; index -= 1) {
      if (pivots[index].type === current.type) {
        previousSameIndex = index;
        break;
      }
    }
    if (previousSameIndex < 0) return;
    const previousSame = pivots[previousSameIndex];
    const currentStart = [...pivots.slice(previousSameIndex + 1, pivotIndex)]
      .reverse()
      .find((pivot) => pivot.type !== current.type);
    const previousStart = [...pivots.slice(0, previousSameIndex)]
      .reverse()
      .find((pivot) => pivot.type !== current.type);
    if (!currentStart || !previousStart || current.index - previousSame.index < 5) return;
    const previousAmplitude = Math.abs(previousStart.price - previousSame.price);
    const currentAmplitude = Math.abs(currentStart.price - current.price);
    const previousStrength = previousAmplitude / Math.max(1, previousSame.index - previousStart.index);
    const currentStrength = currentAmplitude / Math.max(1, current.index - currentStart.index);
    const weaker = currentStrength < previousStrength * MAX_DIVERGENCE_STRENGTH_RATIO;
    const meaningfulAmplitude = currentAmplitude >= previousAmplitude * MIN_DIVERGENCE_AMPLITUDE_RATIO;
    if (current.type !== 'bottom') return;
    const confirmedIndex = current.index + 2;
    const regime = classifyMarketRegime(
      points,
      confirmedIndex,
      DEFAULT_CHAN_MARKET_REGIME_OPTIONS
    );
    if (regime !== 'bear'
      && weaker
      && meaningfulAmplitude
      && current.price < previousSame.price) {
      signals.push({
        id: `local-${current.time}:buy:1`,
        side: 'buy',
        level: 1,
        variant: 'local-divergence',
        time: current.time,
        price: current.price,
        strokeIndex: -1,
        confirmedIndex,
        confirmedTime: points[confirmedIndex].time,
        reason: '周线局部底分型创新低，同向走势斜率衰减，确认时非熊市',
        algorithmVersion: CHAN_ALGORITHM_VERSION,
      });
    }
    const reboundAmplitude = currentStart.price - previousSame.price;
    const pullbackRatio = reboundAmplitude > 0
      ? (currentStart.price - current.price) / reboundAmplitude
      : Number.POSITIVE_INFINITY;
    if (regime === 'bull'
      && current.price > previousSame.price
      && currentStart.price > previousStart.price
      && pullbackRatio >= 0.2
      && pullbackRatio <= 0.8) {
      signals.push({
        id: `local-${current.time}:buy:2`,
        side: 'buy',
        level: 2,
        variant: 'local-second',
        time: current.time,
        price: current.price,
        strokeIndex: -1,
        confirmedIndex,
        confirmedTime: points[confirmedIndex].time,
        reason: '周线局部结构突破后首次回抽形成更高低点，确认时处于牛市',
        algorithmVersion: CHAN_ALGORITHM_VERSION,
      });
    }
  });
  return signals;
}

export function detectChanSignalMatches(
  strokes: readonly ChanStroke[],
  centers: readonly ChanCenter[],
  points?: readonly StockChartPoint[],
  period?: StockChartPeriod
): ChanSignal[] {
  const localDivergences = detectLocalDivergenceSignals(points, period);
  if (strokes.length < 4) return localDivergences;
  const stableLastIndex = strokes.length - 2;
  const signals: ChanSignal[] = [];

  for (let index = 2; index <= stableLastIndex; index += 1) {
    const current = strokes[index];
    const previousSameDirection = strokes[index - 2];
    const guard = strokes[index + 1];
    const center = [...centers]
      .reverse()
      .find((item) => item.endStrokeIndex < index);
    if (!center || current.direction !== previousSameDirection.direction) continue;
    // A first point belongs to the departure immediately following its center.
    // Reusing a much older center turns later trend oscillations into false first points.
    if (index - center.endStrokeIndex > 3) continue;
    const weaker = strokeStrength(current)
      < strokeStrength(previousSameDirection) * MAX_DIVERGENCE_STRENGTH_RATIO;
    const meaningfulAmplitude = current.amplitude
      >= previousSameDirection.amplitude * MIN_DIVERGENCE_AMPLITUDE_RATIO;
    if (!weaker || !meaningfulAmplitude) continue;
    if (current.direction === 'down'
      && current.end.price < previousSameDirection.end.price
      && current.end.price < center.low) {
      signals.push(createSignal(
        current,
        guardStrokeConfirmation(guard)!,
        'buy',
        1,
        `向下离开中枢 ${center.low.toFixed(2)}-${center.high.toFixed(2)} 后创新低，笔力度衰减`
      ));
    }
    if (current.direction === 'up'
      && current.end.price > previousSameDirection.end.price
      && current.end.price > center.high) {
      signals.push(createSignal(
        current,
        guardStrokeConfirmation(guard)!,
        'sell',
        1,
        `向上离开中枢 ${center.low.toFixed(2)}-${center.high.toFixed(2)} 后创新高，笔力度衰减`
      ));
    }
  }

  signals.filter((signal) => signal.level === 1).forEach((first) => {
    const candidateIndex = first.strokeIndex + 2;
    if (candidateIndex > stableLastIndex) return;
    const candidate = strokes[candidateIndex];
    const guard = strokes[candidateIndex + 1];
    const holds = first.side === 'buy'
      ? candidate.direction === 'down' && candidate.end.price > first.price
      : candidate.direction === 'up' && candidate.end.price < first.price;
    if (!holds) return;
    signals.push(createSignal(
      candidate,
      guardStrokeConfirmation(guard)!,
      first.side,
      2,
      first.side === 'buy' ? '一买后回抽不创新低' : '一卖后回抽不创新高'
    ));
  });

  centers.forEach((center) => {
    const exitIndex = center.endStrokeIndex + 1;
    const retestIndex = exitIndex + 1;
    if (retestIndex > stableLastIndex) return;
    const exit = strokes[exitIndex];
    const retest = strokes[retestIndex];
    const guard = strokes[retestIndex + 1];
    if (exit.direction === 'up'
      && exit.end.price > center.high
      && retest.direction === 'down'
      && retest.end.price > center.high) {
      signals.push(createSignal(
        retest,
        guardStrokeConfirmation(guard)!,
        'buy',
        3,
        `突破中枢上沿 ${center.high.toFixed(2)} 后回抽不进入中枢`
      ));
    }
    if (exit.direction === 'down'
      && exit.end.price < center.low
      && retest.direction === 'up'
      && retest.end.price < center.low) {
      signals.push(createSignal(
        retest,
        guardStrokeConfirmation(guard)!,
        'sell',
        3,
        `跌破中枢下沿 ${center.low.toFixed(2)} 后回抽不进入中枢`
      ));
    }
  });

  return [...signals, ...localDivergences]
    .sort((left, right) => left.confirmedIndex - right.confirmedIndex || left.level - right.level);
}

function deduplicateChanSignalMatches(signalMatches: readonly ChanSignal[]): ChanSignal[] {
  const deduplicated = new Map<string, ChanSignal>();
  signalMatches.forEach((signal) => {
    const key = `${signal.time}:${signal.side}:${signal.level}`;
    const current = deduplicated.get(key);
    if (!current || signal.confirmedIndex < current.confirmedIndex) deduplicated.set(key, signal);
  });
  return [...deduplicated.values()]
    .sort((left, right) => left.confirmedIndex - right.confirmedIndex || left.level - right.level);
}

export function detectChanSignals(
  strokes: readonly ChanStroke[],
  centers: readonly ChanCenter[],
  points?: readonly StockChartPoint[],
  period?: StockChartPeriod
): ChanSignal[] {
  return deduplicateChanSignalMatches(detectChanSignalMatches(strokes, centers, points, period));
}

export function analyzeChan(
  points: readonly StockChartPoint[],
  options: ChanAnalysisOptions = {}
): ChanAnalysis {
  const mergedBars = mergeIncludedBars(points);
  const fractals = detectChanFractals(mergedBars);
  const strokes = buildChanStrokes(fractals);
  const stableStrokes = strokes.length > 1 ? strokes.slice(0, -1) : [];
  const centers = findChanCenters(stableStrokes);
  const signalMatches = detectChanSignalMatches(strokes, centers, points, options.period);
  return {
    algorithmVersion: CHAN_ALGORITHM_VERSION,
    mergedBars,
    fractals,
    strokes,
    stableStrokeCount: stableStrokes.length,
    segments: buildChanSegments(stableStrokes),
    centers,
    signalMatches,
    signals: deduplicateChanSignalMatches(signalMatches),
  };
}
