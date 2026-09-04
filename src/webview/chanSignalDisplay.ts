import { ChanSignal } from '../chan/engine';
import { ChanSignalPlot } from '../chan/seriesData';
import { StockChartPeriod, StockChartPoint } from '../shared/stockChartProtocol';

export interface ChanSignalDisplayOptions {
  standardVisible: boolean;
  tdxVisible: boolean;
}

function isTdxSignal(signal: ChanSignalPlot): boolean {
  return signal.variant.startsWith('tdx-');
}

function signalPositionKey(signal: ChanSignalPlot): string {
  return `${signal.time}:${signal.side}`;
}

function preferStrongerSignal(candidate: ChanSignalPlot, current: ChanSignalPlot): boolean {
  return candidate.level < current.level
    || (candidate.level === current.level
      && candidate.confirmedIndex < current.confirmedIndex);
}

export function selectChanSignalsForDisplay(
  signalMatches: readonly ChanSignalPlot[],
  options: ChanSignalDisplayOptions
): ChanSignalPlot[] {
  const standardSignals: ChanSignalPlot[] = [];
  const tdxSignalsByPosition = new Map<string, ChanSignalPlot>();

  signalMatches.forEach((signal) => {
    if (!isTdxSignal(signal)) {
      if (options.standardVisible) standardSignals.push(signal);
      return;
    }
    if (!options.tdxVisible) return;

    const key = signalPositionKey(signal);
    const current = tdxSignalsByPosition.get(key);
    if (!current || preferStrongerSignal(signal, current)) {
      tdxSignalsByPosition.set(key, signal);
    }
  });

  const deduplicated = new Map<string, ChanSignalPlot>();
  [...standardSignals, ...tdxSignalsByPosition.values()].forEach((signal) => {
    const key = `${signalPositionKey(signal)}:${signal.level}`;
    const current = deduplicated.get(key);
    if (!current || signal.confirmedIndex < current.confirmedIndex) {
      deduplicated.set(key, signal);
    }
  });

  return [...deduplicated.values()]
    .sort((left, right) => left.confirmedIndex - right.confirmedIndex || left.level - right.level);
}

export function getCompletedSignalPoints(
  points: readonly StockChartPoint[],
  period: StockChartPeriod,
  marketOpen: boolean
): readonly StockChartPoint[] {
  return marketOpen && period.endsWith('m') && points.length > 0
    ? points.slice(0, -1)
    : points;
}

export function combineConfirmedAndProvisionalSignals(
  confirmedSignals: readonly ChanSignal[],
  liveSignals: readonly ChanSignal[]
): ChanSignalPlot[] {
  const confirmedIds = new Set(confirmedSignals.map((signal) => signal.id));
  return [
    ...confirmedSignals,
    ...liveSignals
      .filter((signal) => !confirmedIds.has(signal.id))
      .map((signal) => ({ ...signal, provisional: true })),
  ];
}
