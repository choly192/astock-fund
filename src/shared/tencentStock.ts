import { getWithRetry } from './httpClient';
import { randHeader } from './utils';

const searchUrl = 'https://proxy.finance.qq.com/ifzqgtimg/appstock/smartbox/search/get';
const stockDataUrl = 'https://qt.gtimg.cn/q=';

export interface StockSearchResult {
  code: string;
  name: string;
  market: string;
}

export interface TencentStockQuote {
  code: string;
  name: string;
  price?: string;
  yestclose?: string;
  open?: string;
  high?: string;
  low?: string;
  volume?: string;
  amount?: string;
  time?: string;
}

function quoteRequestCode(code: string): string {
  const normalized = code.toLowerCase();
  if (normalized.startsWith('usr_')) return `us${normalized.slice(4)}`;
  if (normalized.startsWith('gb_')) return `us${normalized.slice(3)}`;
  return normalized;
}

export function parseTencentStockResponse(
  responseText: string,
  codes: string[]
): TencentStockQuote[] {
  const requestedBySource = new Map(
    codes.map((code) => [quoteRequestCode(code).toLowerCase(), code.toLowerCase()])
  );
  const quotes = new Map<string, TencentStockQuote>();
  const pattern = /v_([^=]+)="([^"]*)";?/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(responseText))) {
    const code = requestedBySource.get(match[1].toLowerCase());
    if (!code) continue;
    const fields = match[2].split('~');
    if (fields.length < 6 || !fields[1]) {
      quotes.set(code, { code, name: 'NODATA' });
      continue;
    }
    quotes.set(code, {
      code,
      name: fields[1],
      price: fields[3],
      yestclose: fields[4],
      open: fields[5],
      time: fields[30],
      high: fields[33],
      low: fields[34],
      volume: fields[36] || fields[6],
      amount: fields[37],
    });
  }
  return codes.map((code) => quotes.get(code.toLowerCase()) || {
    code: code.toLowerCase(),
    name: 'NODATA',
  });
}

export async function searchStockList(
  keyword: string,
  signal?: AbortSignal
): Promise<StockSearchResult[]> {
  const response = await getWithRetry<any>(
    searchUrl,
    { params: { q: keyword }, signal },
    0
  );
  const list = response?.data?.data?.stock || [];
  return list.map((item: string[]) => ({
    code: item[1].toLowerCase(),
    name: item[2],
    market: item[0],
  }));
}

export async function getTencentHKStockData(codes: string[]): Promise<any[]> {
  const response = await getWithRetry<ArrayBuffer>(
    `${stockDataUrl}${codes.map((code) => `r_${code}`).join(',')}&fmt=json`,
    {
    responseType: 'arraybuffer',
    headers: { ...randHeader(), Referer: 'https://gu.qq.com/' },
    }
  );
  const data = JSON.parse(new TextDecoder('gbk').decode(response.data)) as Record<string, any>;

  return codes.map((rawCode) => {
    const code = rawCode.toLowerCase();
    const item = data[`r_${rawCode}`] || data[`r_${code}`];
    if (!item) return { code, name: 'NODATA' };
    return {
      code,
      name: item[1],
      price: item[3],
      yestclose: item[4],
      open: item[5],
      high: item[33],
      low: item[34],
      volume: item[36],
      amount: item[37],
      time: item[30],
    };
  });
}

export async function getTencentStockData(codes: string[]): Promise<TencentStockQuote[]> {
  if (!codes.length) return [];
  const query = codes.map(quoteRequestCode).join(',');
  const response = await getWithRetry<ArrayBuffer>(`${stockDataUrl}${query}`, {
    responseType: 'arraybuffer',
    headers: { ...randHeader(), Referer: 'https://gu.qq.com/' },
  });
  return parseTencentStockResponse(new TextDecoder('gbk').decode(response.data), codes);
}
