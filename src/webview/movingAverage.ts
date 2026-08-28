import { StockChartPoint } from '../shared/stockChartProtocol';

export interface MovingAveragePoint {
  time: StockChartPoint['time'];
  value: number;
}

export function calculateMovingAverage(
  points: ReadonlyArray<Pick<StockChartPoint, 'time' | 'close'>>,
  period: number
): MovingAveragePoint[] {
  if (!Number.isInteger(period) || period <= 0) {
    throw new Error('均线周期必须是正整数');
  }

  let sum = 0;
  const result: MovingAveragePoint[] = [];
  points.forEach((point, index) => {
    sum += point.close;
    if (index >= period) sum -= points[index - period].close;
    if (index < period - 1) return;
    result.push({ time: point.time, value: sum / period });
  });
  return result;
}
