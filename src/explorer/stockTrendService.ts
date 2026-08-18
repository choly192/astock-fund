import { getEastMoneyStockTarget } from '../shared/eastMoneyStock';
import { getWithRetry } from '../shared/httpClient';
import { StockChartData, StockChartPeriod, StockChartPoint } from '../shared/stockChartProtocol';
import {
  aggregateTrendData,
  getTencentChartCode,
  parseTencentKlineResponse,
  parseTencentTrendResponse,
} from '../shared/tencentStockChart';
import { randHeader } from '../shared/utils';

interface CacheEntry {
  expiresAt: number;
  data: StockChartData;
}

function asRecord(value: unknown): Record<string, any> | undefined {
  return value && typeof value === 'object' ? value as Record<string, any> : undefined;
}

function marketTimestamp(text: string): number | undefined {
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  if (!match) return undefined;
  return Math.floor((Date.UTC(
    Number(match[1]), Number(match[2]) - 1, Number(match[3]),
    Number(match[4]), Number(match[5])
  )) / 1000);
}

export function parseEastMoneyKlineResponse(
  value: unknown,
  period: StockChartPeriod
): StockChartData {
  const data = asRecord(asRecord(value)?.data);
  const lines = Array.isArray(data?.klines) ? data!.klines : [];
  const intraday = period.endsWith('m');
  const points: StockChartPoint[] = lines.flatMap((raw: unknown) => {
    const fields = String(raw).split(',');
    const time = intraday ? marketTimestamp(fields[0]) : fields[0];
    const open = Number(fields[1]);
    const close = Number(fields[2]);
    const high = Number(fields[3]);
    const low = Number(fields[4]);
    const volume = Number(fields[5]);
    if (!time || ![open, close, high, low, volume].every(Number.isFinite)) return [];
    return [{ time, open, close, high, low, volume }];
  });
  if (!points.length) throw new Error('K 线数据为空');
  return {
    period,
    kind: 'candlestick',
    points,
    previousClose: Number.isFinite(Number(data?.prePrice)) ? Number(data?.prePrice) : undefined,
  };
}

export function parseEastMoneyTrendResponse(value: unknown): StockChartData {
  const data = asRecord(asRecord(value)?.data);
  const trends = Array.isArray(data?.trends) ? data!.trends : [];
  const previousClose = Number(data?.prePrice);
  const points: StockChartPoint[] = trends.flatMap((raw: unknown) => {
    const fields = String(raw).split(',');
    const time = marketTimestamp(fields[0]);
    const open = Number(fields[1]);
    const close = Number(fields[2]);
    const high = Number(fields[3]);
    const low = Number(fields[4]);
    const volume = Number(fields[5]);
    const average = Number(fields[7]);
    if (!time || ![open, close, high, low, volume].every(Number.isFinite)) return [];
    return [{
      time,
      open,
      high,
      low,
      close,
      volume,
      average: Number.isFinite(average) ? average : undefined,
    }];
  });
  if (!points.length) throw new Error('分时数据为空');
  return {
    period: 'trend',
    kind: 'line',
    points,
    previousClose: Number.isFinite(previousClose) ? previousClose : undefined,
  };
}

const klinePeriods: Record<Exclude<StockChartPeriod, 'trend'>, number> = {
  day: 101,
  week: 102,
  month: 103,
  '5m': 5,
  '15m': 15,
  '30m': 30,
  '60m': 60,
};

export class StockTrendService {
  private readonly cache = new Map<string, CacheEntry>();

  async getData(code: string, period: StockChartPeriod): Promise<StockChartData> {
    const key = `${code.toLowerCase()}:${period}`;
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.data;

    let data: StockChartData;
    try {
      data = period === 'trend'
        ? await this.getTencentTrend(code)
        : await this.getTencentKline(code, period);
    } catch (tencentError) {
      console.warn('Tencent stock chart request failed; falling back to East Money', tencentError);
      const target = getEastMoneyStockTarget(code);
      data = period === 'trend'
        ? await this.getTrend(target.secid)
        : await this.getKline(target.secid, period);
    }
    const ttl = period === 'trend' ? 20 * 1000 : period.endsWith('m') ? 60 * 1000 : 10 * 60 * 1000;
    this.cache.set(key, { data, expiresAt: Date.now() + ttl });
    return data;
  }

  private async getTencentTrend(code: string): Promise<StockChartData> {
    const response = await getWithRetry<unknown>(
      'https://web.ifzq.gtimg.cn/appstock/app/minute/query',
      {
        params: { code: getTencentChartCode(code) },
        headers: { ...randHeader(), Referer: 'https://gu.qq.com/' },
      }
    );
    return parseTencentTrendResponse(response.data, code);
  }

  private async getTencentKline(
    code: string,
    period: Exclude<StockChartPeriod, 'trend'>
  ): Promise<StockChartData> {
    const sourceCode = getTencentChartCode(code);
    if (period.endsWith('m')) {
      const minutePeriod = period as Extract<typeof period, `${number}m`>;
      try {
        const sourcePeriod = `m${minutePeriod.slice(0, -1)}`;
        const response = await getWithRetry<unknown>(
          'https://ifzq.gtimg.cn/appstock/app/kline/mkline',
          {
            params: { param: `${sourceCode},${sourcePeriod},,640` },
            headers: { ...randHeader(), Referer: 'https://gu.qq.com/' },
          }
        );
        return parseTencentKlineResponse(response.data, code, minutePeriod);
      } catch (error) {
        console.warn('Tencent minute K-line unavailable; aggregating intraday data', error);
        return aggregateTrendData(await this.getTencentTrend(code), minutePeriod);
      }
    }

    const response = await getWithRetry<unknown>(
      'https://web.ifzq.gtimg.cn/appstock/app/fqkline/get',
      {
        params: { param: `${sourceCode},${period},,,500,qfq` },
        headers: { ...randHeader(), Referer: 'https://gu.qq.com/' },
      }
    );
    return parseTencentKlineResponse(response.data, code, period);
  }

  private async getTrend(secid: string): Promise<StockChartData> {
    const response = await getWithRetry<unknown>(
      'https://push2his.eastmoney.com/api/qt/stock/trends2/get',
      {
        params: {
          secid,
          ndays: 1,
          iscr: 0,
          iscca: 0,
          fields1: 'f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12,f13',
          fields2: 'f51,f52,f53,f54,f55,f56,f57,f58',
        },
        headers: { ...randHeader(), Referer: 'https://quote.eastmoney.com/' },
      }
    );
    return parseEastMoneyTrendResponse(response.data);
  }

  private async getKline(
    secid: string,
    period: Exclude<StockChartPeriod, 'trend'>
  ): Promise<StockChartData> {
    const response = await getWithRetry<unknown>(
      'https://push2his.eastmoney.com/api/qt/stock/kline/get',
      {
        params: {
          secid,
          klt: klinePeriods[period],
          fqt: 1,
          lmt: period.endsWith('m') ? 1000 : 500,
          end: '20500101',
          iscca: 1,
          fields1: 'f1,f2,f3,f4,f5,f6',
          fields2: 'f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61',
        },
        headers: { ...randHeader(), Referer: 'https://quote.eastmoney.com/' },
      }
    );
    return parseEastMoneyKlineResponse(response.data, period);
  }
}
