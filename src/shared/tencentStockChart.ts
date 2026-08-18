import {
  StockChartData,
  StockChartPeriod,
  StockChartPoint,
} from './stockChartProtocol';

type TencentKlinePeriod = Exclude<StockChartPeriod, 'trend'>;

function asRecord(value: unknown): Record<string, any> | undefined {
  return value && typeof value === 'object' ? value as Record<string, any> : undefined;
}

function getProperty(record: Record<string, any> | undefined, key: string): any {
  if (!record) return undefined;
  if (key in record) return record[key];
  const actualKey = Object.keys(record).find((item) => item.toLowerCase() === key.toLowerCase());
  return actualKey ? record[actualKey] : undefined;
}

function getStockData(value: unknown, sourceCode: string): Record<string, any> | undefined {
  return asRecord(getProperty(asRecord(asRecord(value)?.data), sourceCode));
}

function getQuote(item: Record<string, any> | undefined, sourceCode: string): any[] {
  const quote = getProperty(asRecord(item?.qt), sourceCode);
  return Array.isArray(quote) ? quote : [];
}

function normalizeDate(value: unknown): string | undefined {
  const match = String(value || '').match(/(\d{4})\D?(\d{2})\D?(\d{2})/);
  return match ? `${match[1]}${match[2]}${match[3]}` : undefined;
}

function marketTimestamp(date: string, clock: string): number | undefined {
  const text = `${date}${clock}`.replace(/\D/g, '');
  if (text.length < 12) return undefined;
  const timestamp = Date.UTC(
    Number(text.slice(0, 4)),
    Number(text.slice(4, 6)) - 1,
    Number(text.slice(6, 8)),
    Number(text.slice(8, 10)),
    Number(text.slice(10, 12))
  );
  return Number.isFinite(timestamp) ? Math.floor(timestamp / 1000) : undefined;
}

function isRegularTradingMinute(sourceCode: string, clock: string): boolean {
  const text = clock.replace(/\D/g, '').padStart(4, '0');
  const minute = Number(text.slice(0, 2)) * 60 + Number(text.slice(2, 4));
  const inSession = (start: number, end: number) => minute >= start && minute <= end;
  const code = sourceCode.toLowerCase();
  if (code.startsWith('sh') || code.startsWith('sz') || code.startsWith('bj')) {
    return inSession(9 * 60 + 30, 11 * 60 + 30) || inSession(13 * 60, 15 * 60);
  }
  if (code.startsWith('hk')) {
    return inSession(9 * 60 + 30, 12 * 60) || inSession(13 * 60, 16 * 60);
  }
  if (code.startsWith('us')) return inSession(9 * 60 + 30, 16 * 60);
  return true;
}

export function getTencentChartCode(rawCode: string): string {
  const code = rawCode.trim().toLowerCase();
  if (code.startsWith('usr_')) return `us${code.slice(4).toUpperCase()}`;
  if (code.startsWith('gb_')) return `us${code.slice(3).toUpperCase()}`;
  return code;
}

export function parseTencentTrendResponse(
  value: unknown,
  rawCode: string
): StockChartData {
  const sourceCode = getTencentChartCode(rawCode);
  const item = getStockData(value, sourceCode);
  const quote = getQuote(item, sourceCode);
  const series = asRecord(item?.data);
  const rows = Array.isArray(series?.data) ? series!.data : [];
  const date = normalizeDate(series?.date) || normalizeDate(quote[30]);
  const previousClose = Number(quote[4]);
  const marketOpen = Number(quote[5]);
  if (!date) throw new Error('腾讯分时数据缺少交易日期');

  let previousCumulativeVolume = 0;
  let previousPrice = Number.isFinite(marketOpen)
    ? marketOpen
    : Number.isFinite(previousClose) ? previousClose : undefined;
  let volumeScale: number | undefined;
  let weightedPriceVolume = 0;
  let totalVolume = 0;
  const points: StockChartPoint[] = rows.flatMap((raw: unknown) => {
    const fields = String(raw).trim().split(/\s+/);
    if (!isRegularTradingMinute(sourceCode, fields[0])) return [];
    const time = marketTimestamp(date, fields[0]);
    const close = Number(fields[1]);
    const cumulativeVolume = Number(fields[2]);
    const cumulativeAmount = Number(fields[3]);
    if (!time || ![close, cumulativeVolume].every(Number.isFinite)) return [];

    const volume = Math.max(0, cumulativeVolume - previousCumulativeVolume);
    previousCumulativeVolume = cumulativeVolume;
    const open = previousPrice ?? close;
    previousPrice = close;
    weightedPriceVolume += close * volume;
    totalVolume += volume;

    if (
      volumeScale === undefined &&
      cumulativeVolume > 0 &&
      close > 0 &&
      Number.isFinite(cumulativeAmount) &&
      cumulativeAmount > 0
    ) {
      volumeScale = cumulativeAmount / cumulativeVolume / close;
    }
    const sourceAverage = volumeScale && Number.isFinite(cumulativeAmount)
      ? cumulativeAmount / cumulativeVolume / volumeScale
      : Number.NaN;
    const average = Number.isFinite(sourceAverage)
      ? sourceAverage
      : totalVolume > 0 ? weightedPriceVolume / totalVolume : close;
    return [{
      time,
      open,
      high: Math.max(open, close),
      low: Math.min(open, close),
      close,
      volume,
      average,
    }];
  });
  if (!points.length) throw new Error('腾讯分时数据为空');
  return {
    period: 'trend',
    kind: 'line',
    points,
    previousClose: Number.isFinite(previousClose) ? previousClose : undefined,
  };
}

export function parseTencentKlineResponse(
  value: unknown,
  rawCode: string,
  period: TencentKlinePeriod
): StockChartData {
  const sourceCode = getTencentChartCode(rawCode);
  const item = getStockData(value, sourceCode);
  const intraday = period.endsWith('m');
  const sourcePeriod = intraday ? `m${period.slice(0, -1)}` : period;
  const rows = intraday
    ? item?.[sourcePeriod]
    : item?.[`qfq${sourcePeriod}`] || item?.[sourcePeriod];
  const quote = getQuote(item, sourceCode);
  const previousClose = Number(item?.prec ?? quote[4]);
  const points: StockChartPoint[] = (Array.isArray(rows) ? rows : []).flatMap(
    (raw: unknown) => {
      const fields = Array.isArray(raw) ? raw : String(raw).split(',');
      const dateText = String(fields[0]);
      const time = intraday
        ? marketTimestamp(dateText.slice(0, 8), dateText.slice(8, 12))
        : dateText;
      const open = Number(fields[1]);
      const close = Number(fields[2]);
      const high = Number(fields[3]);
      const low = Number(fields[4]);
      const volume = Number(fields[5]);
      if (!time || ![open, close, high, low, volume].every(Number.isFinite)) return [];
      return [{ time, open, close, high, low, volume }];
    }
  );
  if (!points.length) throw new Error('腾讯 K 线数据为空');
  return {
    period,
    kind: 'candlestick',
    points,
    previousClose: Number.isFinite(previousClose) ? previousClose : undefined,
  };
}

export function aggregateTrendData(
  trend: StockChartData,
  period: Extract<TencentKlinePeriod, `${number}m`>
): StockChartData {
  const size = Number.parseInt(period, 10);
  const candles: StockChartPoint[] = [];
  let bucket: StockChartPoint[] = [];
  let previousTime: number | undefined;

  const flush = () => {
    if (!bucket.length) return;
    const first = bucket[0];
    const last = bucket[bucket.length - 1];
    candles.push({
      time: last.time,
      open: first.open,
      high: Math.max(...bucket.map((point) => point.high)),
      low: Math.min(...bucket.map((point) => point.low)),
      close: last.close,
      volume: bucket.reduce((total, point) => total + point.volume, 0),
    });
    bucket = [];
  };

  trend.points.forEach((point) => {
    const time = typeof point.time === 'number' ? point.time : undefined;
    const sessionBreak = time !== undefined && previousTime !== undefined && time - previousTime > 120;
    if (sessionBreak || bucket.length >= size) flush();
    bucket.push(point);
    previousTime = time;
  });
  flush();
  if (!candles.length) throw new Error('分钟 K 线聚合结果为空');
  return {
    period,
    kind: 'candlestick',
    points: candles,
    previousClose: trend.previousClose,
  };
}
