import type { CustomData, Time } from 'lightweight-charts';
import { StockChartPoint } from '../shared/stockChartProtocol';
import { ChanSignal } from './engine';

export interface ChanSignalSeriesData extends CustomData<Time> {
  time: Time;
  signals: ChanSignal[];
}

export function buildChanSignalSeriesData(
  points: readonly StockChartPoint[],
  signals: readonly ChanSignal[]
): ChanSignalSeriesData[] {
  const signalsByTime = new Map<StockChartPoint['time'], ChanSignal[]>();
  signals.forEach((signal) => {
    const values = signalsByTime.get(signal.time) ?? [];
    values.push(signal);
    signalsByTime.set(signal.time, values);
  });
  return points.map((point) => ({
    time: point.time as Time,
    signals: [...(signalsByTime.get(point.time) ?? [])]
      .sort((left, right) => left.level - right.level),
  }));
}
