export type StockChartPeriod = 'trend' | 'day' | 'week' | 'month' | '5m' | '15m' | '30m' | '60m';

export interface StockChartPoint {
  time: string | number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  average?: number;
}

export interface StockChartData {
  period: StockChartPeriod;
  kind: 'line' | 'candlestick';
  points: StockChartPoint[];
  previousClose?: number;
}

export interface StockChartRequestMessage {
  type: 'loadPeriod';
  period: StockChartPeriod;
}

export interface StockChartResponseMessage {
  type: 'chartData' | 'chartError';
  period: StockChartPeriod;
  data?: StockChartData;
  message?: string;
}
