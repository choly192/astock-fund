import * as fs from 'fs';
import * as path from 'path';
import { getWithRetry } from '../shared/httpClient';
import { StockChartPoint } from '../shared/stockChartProtocol';
import { getTencentChartCode, parseTencentKlineResponse } from '../shared/tencentStockChart';
import {
  ChanValidationDataset,
  ChanValidationPeriod,
  inferChanAssetType,
} from './validation';

const DEFAULT_SYMBOLS = [
  'sh000001', 'sh000300', 'sz399006',
  'sh600519', 'sz000858', 'sh600887',
  'sh601318', 'sh600036', 'sh601398', 'sh600030',
  'sh600276', 'sz300750', 'sz002594', 'sh601012',
  'sh600031', 'sh601899', 'sz002415', 'sz300059',
  'sh688981', 'sh600900', 'sh601888', 'sz000333', 'sz000001',
];
const DEFAULT_PERIODS: ChanValidationPeriod[] = ['day', 'week', '60m'];
const PERIOD_COUNTS: Partial<Record<ChanValidationPeriod, number>> = {
  day: 1500,
  week: 600,
  month: 500,
  '5m': 1000,
  '15m': 1000,
  '30m': 1000,
  '60m': 1000,
};

interface FetchOptions {
  outputPath: string;
  symbols: string[];
  periods: ChanValidationPeriod[];
  concurrency: number;
}

function isValidPoint(point: StockChartPoint): boolean {
  return [point.open, point.high, point.low, point.close, point.volume].every(Number.isFinite)
    && point.open > 0
    && point.high > 0
    && point.low > 0
    && point.close > 0
    && point.volume >= 0
    && point.high >= Math.max(point.open, point.close, point.low)
    && point.low <= Math.min(point.open, point.close, point.high);
}

export function trimInvalidAdjustedHistory(points: readonly StockChartPoint[]): StockChartPoint[] {
  const firstValidIndex = points.findIndex(isValidPoint);
  if (firstValidIndex < 0) return [];
  return points.slice(firstValidIndex).filter(isValidPoint);
}

function usage(): string {
  return [
    'Usage:',
    '  npm run fetch:chan-data -- [output.json] [symbols] [periods]',
    '  node out/chan/fetchValidationDataCli.js --output <data.json> [options]',
    '',
    'Options:',
    '  --symbols <sh000001,sh600519>  股票或指数代码；省略时使用仓库代表性样本',
    '  --periods <day,week,60m>        K 线周期',
    '  --concurrency <4>               同时请求数',
  ].join('\n');
}

function commaList(value: string): string[] {
  return [...new Set(value.split(',').map((item) => item.trim()).filter(Boolean))];
}

export function parseFetchOptions(args: readonly string[]): FetchOptions {
  if (args.length && !args[0].startsWith('--')) {
    const [outputPath, rawSymbols, rawPeriods, ...rest] = args;
    if (rest.length) throw new Error(`位置参数过多\n${usage()}`);
    return normalizeFetchOptions({
      outputPath,
      symbols: rawSymbols ? commaList(rawSymbols) : DEFAULT_SYMBOLS,
      periods: (rawPeriods ? commaList(rawPeriods) : DEFAULT_PERIODS) as ChanValidationPeriod[],
      concurrency: 4,
    });
  }
  let outputPath = '.chan-validation/expanded-input.json';
  let symbols = DEFAULT_SYMBOLS;
  let periods = DEFAULT_PERIODS;
  let concurrency = 4;
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (flag === '--help' || flag === '-h') throw new Error(usage());
    const value = args[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`${flag} 缺少参数`);
    index += 1;
    if (flag === '--output') outputPath = value;
    else if (flag === '--symbols') symbols = commaList(value);
    else if (flag === '--periods') periods = commaList(value) as ChanValidationPeriod[];
    else if (flag === '--concurrency') concurrency = Number(value);
    else throw new Error(`未知参数：${flag}\n${usage()}`);
  }
  return normalizeFetchOptions({ outputPath, symbols, periods, concurrency });
}

function normalizeFetchOptions(options: FetchOptions): FetchOptions {
  if (!options.outputPath) throw new Error('output 不能为空');
  if (!options.symbols.length) throw new Error('symbols 不能为空');
  if (!options.periods.length || options.periods.some((period) => !(period in PERIOD_COUNTS))) {
    throw new Error('periods 包含不支持的周期');
  }
  if (!Number.isInteger(options.concurrency) || options.concurrency <= 0 || options.concurrency > 10) {
    throw new Error('concurrency 必须是 1 到 10 的整数');
  }
  return options;
}

async function fetchDataset(
  symbol: string,
  period: ChanValidationPeriod
): Promise<ChanValidationDataset> {
  const sourceCode = getTencentChartCode(symbol);
  const count = PERIOD_COUNTS[period] ?? 500;
  const intraday = period.endsWith('m');
  const url = intraday
    ? 'https://ifzq.gtimg.cn/appstock/app/kline/mkline'
    : 'https://web.ifzq.gtimg.cn/appstock/app/fqkline/get';
  const sourcePeriod = intraday ? `m${period.slice(0, -1)}` : period;
  const param = intraday
    ? `${sourceCode},${sourcePeriod},,${count}`
    : `${sourceCode},${period},,,${count},hfq`;
  const response = await getWithRetry<unknown>(url, {
    params: { param },
    headers: { Referer: 'https://gu.qq.com/', 'User-Agent': 'stock-eagle-eye validation' },
    timeout: 20000,
  }, 2);
  const data = parseTencentKlineResponse(response.data, symbol, period, 'hfq');
  const points = trimInvalidAdjustedHistory(data.points);
  if (!points.length) throw new Error(`${symbol} ${period} 没有有效的正价格 K 线`);
  return {
    symbol,
    period,
    assetType: inferChanAssetType(symbol),
    source: intraday ? 'Tencent unadjusted minute K-line' : 'Tencent backward-adjusted K-line',
    points,
  };
}

async function mapConcurrent<T, R>(
  values: readonly T[],
  concurrency: number,
  mapper: (value: T, index: number) => Promise<R>
): Promise<R[]> {
  const result = new Array<R>(values.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      result[index] = await mapper(values[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, worker));
  return result;
}

export async function runFetchCli(args: readonly string[]): Promise<void> {
  const options = parseFetchOptions(args);
  const jobs = options.symbols.flatMap((symbol) =>
    options.periods.map((period) => ({ symbol, period }))
  );
  const datasets = await mapConcurrent(jobs, options.concurrency, async (job, index) => {
    process.stdout.write(`[${index + 1}/${jobs.length}] ${job.symbol} ${job.period}\n`);
    return fetchDataset(job.symbol, job.period);
  });
  const outputPath = path.resolve(options.outputPath);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify({ datasets }, null, 2)}\n`, 'utf8');
  process.stdout.write(`已写入 ${datasets.length} 个数据集：${outputPath}\n`);
}

if (require.main === module) {
  runFetchCli(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
