import { ExtensionContext, QuickPickItem, window } from 'vscode';
import { FundTreeItem } from '../shared/fundTreeItem';
import { mapSettledWithConcurrency } from '../shared/async';
import { getWithRetry, isCanceledRequest } from '../shared/httpClient';
import { FundHistory, FundInfo, FundTrendPoint } from '../shared/typed';
import { randHeader, uniqueCodes } from '../shared/utils';

interface FundSearchResult {
  code: string;
  name: string;
  fundType: string;
  netValue?: string;
  date?: string;
}

interface LatestNetValue {
  date: string;
  netValue: string;
  cumulativeNetValue: string;
  percent: string;
}

const FUND_QUOTE_CACHE_KEY = 'stock-eagle-eye.fundQuoteCache';
const FUND_QUOTE_CACHE_TIME_KEY = 'stock-eagle-eye.fundQuoteCacheTimes';
const FUND_QUOTE_CACHE_TTL = 15 * 60 * 1000;
const FUND_REQUEST_CONCURRENCY = 6;

function shanghaiDate(timestamp: number): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(timestamp));
  const part = (type: string) => parts.find((item) => item.type === type)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function isFundQuoteCacheFresh(
  info: FundInfo,
  fetchedAt: number | undefined,
  now = Date.now()
): boolean {
  if (!fetchedAt || fetchedAt > now) return false;
  if (now - fetchedAt <= FUND_QUOTE_CACHE_TTL) return true;
  return info.date === shanghaiDate(now);
}

function asRecord(value: unknown): Record<string, any> | undefined {
  return value && typeof value === 'object' ? (value as Record<string, any>) : undefined;
}

export function parseFundSearchResponse(data: unknown): FundSearchResult[] {
  const root = asRecord(data);
  if (!root || !Array.isArray(root.Datas)) return [];
  return root.Datas.flatMap((raw: unknown) => {
    const item = asRecord(raw);
    const base = asRecord(item?.FundBaseInfo);
    const code = String(item?.CODE || base?.FCODE || '').trim();
    const name = String(item?.NAME || base?.SHORTNAME || '').trim();
    if (!/^\d{6}$/.test(code) || !name || !base) return [];
    return [{
      code,
      name,
      fundType: String(base.FTYPE || item?.CATEGORYDESC || '基金'),
      netValue: base.DWJZ === undefined || base.DWJZ === null ? undefined : String(base.DWJZ),
      date: base.FSRQ ? String(base.FSRQ) : undefined,
    }];
  });
}

export function parseLatestNetValueResponse(data: unknown): LatestNetValue | undefined {
  const root = asRecord(data);
  const container = asRecord(root?.Data);
  const latest = Array.isArray(container?.LSJZList) ? asRecord(container.LSJZList[0]) : undefined;
  if (!latest) return undefined;
  const netValue = String(latest.DWJZ || '').trim();
  if (!netValue) return undefined;
  return {
    date: String(latest.FSRQ || ''),
    netValue,
    cumulativeNetValue: String(latest.LJJZ || ''),
    percent: String(latest.JZZZL ?? '--'),
  };
}

function findJsonAssignment(script: string, variable: string): unknown {
  const match = new RegExp(`(?:var\\s+)?${variable}\\s*=\\s*`).exec(script);
  if (!match) return undefined;
  const start = match.index + match[0].length;
  const opening = script[start];
  if (!['[', '{', '"'].includes(opening)) return undefined;
  const closing = opening === '[' ? ']' : opening === '{' ? '}' : '"';
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let index = start; index < script.length; index += 1) {
    const char = script[index];
    if (opening === '"') {
      if (index > start && char === '"' && !escaped) {
        return JSON.parse(script.slice(start, index + 1));
      }
      escaped = char === '\\' && !escaped;
      if (char !== '\\') escaped = false;
      continue;
    }
    if (quoted) {
      if (char === '"' && !escaped) quoted = false;
      escaped = char === '\\' && !escaped;
      if (char !== '\\') escaped = false;
      continue;
    }
    if (char === '"') {
      quoted = true;
      continue;
    }
    if (char === opening) depth += 1;
    if (char === closing) depth -= 1;
    if (depth === 0) return JSON.parse(script.slice(start, index + 1));
  }
  return undefined;
}

function readStringAssignment(script: string, variable: string): string | undefined {
  const value = findJsonAssignment(script, variable);
  return typeof value === 'string' ? value : undefined;
}

function readReturn(script: string, variable: string): string | undefined {
  const match = new RegExp(`(?:var\\s+)?${variable}\\s*=\\s*["']([^"']*)["']`).exec(script);
  return match?.[1];
}

export function parseFundHistoryScript(script: string, fallbackCode: string): FundHistory {
  const rawNetWorth = findJsonAssignment(script, 'Data_netWorthTrend');
  const netWorthTrend: FundTrendPoint[] = Array.isArray(rawNetWorth)
    ? rawNetWorth.flatMap((raw: unknown) => {
        const item = asRecord(raw);
        const timestamp = Number(item?.x);
        const value = Number(item?.y);
        if (!Number.isFinite(timestamp) || !Number.isFinite(value)) return [];
        const dailyReturn = Number(item?.equityReturn);
        return [{
          timestamp,
          value,
          dailyReturn: Number.isFinite(dailyReturn) ? dailyReturn : undefined,
        }];
      })
    : [];

  const rawGrandTotal = findJsonAssignment(script, 'Data_grandTotal');
  const firstSeries = Array.isArray(rawGrandTotal)
    ? rawGrandTotal.find((item: unknown) => Array.isArray(asRecord(item)?.data))
    : undefined;
  const cumulativeReturnTrend: FundTrendPoint[] = Array.isArray(asRecord(firstSeries)?.data)
    ? asRecord(firstSeries)!.data.flatMap((raw: unknown) => {
        if (!Array.isArray(raw)) return [];
        const timestamp = Number(raw[0]);
        const value = Number(raw[1]);
        return Number.isFinite(timestamp) && Number.isFinite(value)
          ? [{ timestamp, value }]
          : [];
      })
    : [];

  if (!netWorthTrend.length) throw new Error('基金历史净值数据为空');
  return {
    code: readStringAssignment(script, 'fS_code') || fallbackCode,
    name: readStringAssignment(script, 'fS_name') || fallbackCode,
    netWorthTrend,
    cumulativeReturnTrend,
    returns: {
      oneMonth: readReturn(script, 'syl_1y'),
      threeMonths: readReturn(script, 'syl_3y'),
      sixMonths: readReturn(script, 'syl_6y'),
      oneYear: readReturn(script, 'syl_1n'),
    },
  };
}

export default class FundService {
  public fundList: FundTreeItem[] = [];
  private lastErrorAt = 0;
  private readonly metadata = new Map<string, FundSearchResult>();
  private readonly quoteCacheTimes: Record<string, number>;

  constructor(private readonly context: ExtensionContext) {
    const cached = context.globalState.get<FundInfo[]>(FUND_QUOTE_CACHE_KEY, []);
    this.quoteCacheTimes = context.globalState.get<Record<string, number>>(
      FUND_QUOTE_CACHE_TIME_KEY,
      {}
    );
    cached.forEach((info) => {
      this.metadata.set(info.code, {
        code: info.code,
        name: info.name,
        fundType: info.fundType || '基金',
      });
    });
    this.fundList = cached.map(
      (info) => new FundTreeItem({ ...info, stale: true }, this.context)
    );
  }

  async getData(codes: string[]): Promise<FundTreeItem[]> {
    const supportedCodes = uniqueCodes(codes).filter((code) => /^\d{6}$/.test(code));
    const settled = await mapSettledWithConcurrency(
      supportedCodes,
      FUND_REQUEST_CONCURRENCY,
      (code) => this.getFundInfo(code)
    );
    const cachedByCode = new Map(
      this.fundList
        .filter((item) => item.info.type !== 'nodata')
        .map((item) => [item.info.code, item.info])
    );
    this.fundList = settled.map((result, index) => {
      if (result.status === 'fulfilled') return new FundTreeItem(result.value, this.context);
      const code = supportedCodes[index];
      const cached = cachedByCode.get(code);
      return cached
        ? new FundTreeItem({ ...cached, stale: true }, this.context)
        : new FundTreeItem({
            code,
            name: `暂无净值：${code}`,
            netValue: '--',
            percent: '--',
            type: 'nodata',
            contextValue: 'fundNoData',
          }, this.context);
    });
    void this.context.globalState.update(
      FUND_QUOTE_CACHE_KEY,
      this.fundList.filter((item) => item.info.type !== 'nodata').map((item) => item.info)
    );
    const activeTimes = Object.fromEntries(
      supportedCodes.flatMap((code) => this.quoteCacheTimes[code]
        ? [[code, this.quoteCacheTimes[code]]]
        : [])
    );
    void this.context.globalState.update(FUND_QUOTE_CACHE_TIME_KEY, activeTimes);
    if (settled.some((result) => result.status === 'rejected')) {
      this.reportError('部分基金净值获取失败，请检查网络后重试');
    }
    return this.fundList;
  }

  private async getFundInfo(code: string): Promise<FundInfo> {
    const cachedQuote = this.fundList.find((item) => item.info.code === code)?.info;
    if (
      cachedQuote &&
      cachedQuote.type !== 'nodata' &&
      isFundQuoteCacheFresh(cachedQuote, this.quoteCacheTimes[code])
    ) {
      return { ...cachedQuote, stale: false };
    }
    const cachedMetadata = this.metadata.get(code);
    const [searchResponse, latestResponse] = await Promise.all([
      cachedMetadata
        ? Promise.resolve(undefined)
        : getWithRetry<any>('https://fundsuggest.eastmoney.com/FundSearch/api/FundSearchAPI.ashx', {
            params: { m: 1, key: code },
            headers: randHeader(),
          }),
      getWithRetry<any>('https://api.fund.eastmoney.com/f10/lsjz', {
        params: { fundCode: code, pageIndex: 1, pageSize: 1 },
        headers: { ...randHeader(), Referer: 'https://fundf10.eastmoney.com/' },
      }),
    ]);
    const search = cachedMetadata || parseFundSearchResponse(searchResponse?.data).find(
      (item) => item.code === code
    );
    const latest = parseLatestNetValueResponse(latestResponse.data);
    if (!search || !latest) throw new Error(`No fund quote: ${code}`);
    this.metadata.set(code, search);
    this.quoteCacheTimes[code] = Date.now();
    return {
      code,
      name: search.name,
      fundType: search.fundType,
      netValue: latest.netValue,
      cumulativeNetValue: latest.cumulativeNetValue,
      percent: latest.percent,
      date: latest.date,
      type: 'fund',
      contextValue: 'fund',
      fetchedAt: Date.now(),
      source: '东方财富',
    };
  }

  async getFundSuggestList(
    searchText = '',
    signal?: AbortSignal
  ): Promise<QuickPickItem[]> {
    if (signal?.aborted) return [];
    if (!searchText.trim()) return [{ label: '请输入基金代码或名称' }];
    try {
      const response = await getWithRetry<any>(
        'https://fundsuggest.eastmoney.com/FundSearch/api/FundSearchAPI.ashx',
        { params: { m: 1, key: searchText.trim() }, headers: randHeader(), signal },
        0
      );
      const funds = parseFundSearchResponse(response.data);
      funds.forEach((item) => this.metadata.set(item.code, item));
      return funds.map((item) => ({
        label: `${item.code} | ${item.name}`,
        description: item.fundType,
        detail: item.netValue ? `最新单位净值 ${item.netValue}  ${item.date || ''}` : undefined,
      }));
    } catch (error) {
      if (signal?.aborted || isCanceledRequest(error)) return [];
      console.error(error);
      return [{ label: '基金查询失败，请重试' }];
    }
  }

  async getFundHistory(code: string): Promise<FundHistory> {
    const response = await getWithRetry<string>(
      `https://fund.eastmoney.com/pingzhongdata/${encodeURIComponent(code)}.js`,
      {
        params: { v: Date.now() },
        responseType: 'text',
        transformResponse: [(data) => String(data)],
        headers: { ...randHeader(), Referer: `https://fund.eastmoney.com/${code}.html` },
      }
    );
    return parseFundHistoryScript(String(response.data).replace(/^\uFEFF/, ''), code);
  }

  private reportError(message: string): void {
    if (Date.now() - this.lastErrorAt < 5 * 60 * 1000) return;
    this.lastErrorAt = Date.now();
    window.showErrorMessage(message);
  }

}
