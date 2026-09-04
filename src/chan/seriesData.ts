import type { CustomData, Time } from 'lightweight-charts';
import { StockChartPoint } from '../shared/stockChartProtocol';
import { ChanSignal } from './engine';

export interface ChanSignalPlot extends ChanSignal {
  provisional?: boolean;
}

export interface ChanSignalSeriesData extends CustomData<Time> {
  time: Time;
  signals: ChanSignalPlot[];
  confirmations: ChanSignalPlot[];
}

export function buildChanSignalSeriesData(
  points: readonly StockChartPoint[],
  signals: readonly ChanSignalPlot[]
): ChanSignalSeriesData[] {
  const signalsByTime = new Map<StockChartPoint['time'], ChanSignalPlot[]>();
  const confirmationsByTime = new Map<StockChartPoint['time'], ChanSignalPlot[]>();
  signals.forEach((signal) => {
    const values = signalsByTime.get(signal.time) ?? [];
    values.push(signal);
    signalsByTime.set(signal.time, values);
    const confirmations = confirmationsByTime.get(signal.confirmedTime) ?? [];
    confirmations.push(signal);
    confirmationsByTime.set(signal.confirmedTime, confirmations);
  });
  return points.map((point) => ({
    time: point.time as Time,
    signals: [...(signalsByTime.get(point.time) ?? [])]
      .sort((left, right) => left.level - right.level),
    confirmations: [...(confirmationsByTime.get(point.time) ?? [])]
      .sort((left, right) => left.level - right.level),
  }));
}
