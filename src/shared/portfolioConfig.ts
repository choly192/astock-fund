import { FundConfig, normalizeFundCode } from './fundConfig';
import { StockEagleEyeConfig, normalizeStockCode } from './stockEagleEyeConfig';
import { FundGroupConfig, StockGroupConfig } from './typed';

interface GroupFileEntry {
  name: string;
  codes: string[];
}

interface PortfolioFile {
  formatVersion: 1;
  stockGroups: GroupFileEntry[];
  fundGroups: GroupFileEntry[];
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' ? value as Record<string, unknown> : undefined;
}

function toEntries(config: StockGroupConfig | FundGroupConfig): GroupFileEntry[] {
  return config.names.map((name, index) => ({ name, codes: [...config.lists[index]] }));
}

function parseGroups(value: unknown, kind: 'stock' | 'fund'): StockGroupConfig | FundGroupConfig {
  if (!Array.isArray(value)) throw new Error(`${kind === 'stock' ? '股票' : '基金'}分组必须是数组`);
  const names: string[] = [];
  const lists: string[][] = [];
  value.forEach((raw, index) => {
    const entry = asRecord(raw);
    const name = typeof entry?.name === 'string' ? entry.name.trim() : '';
    if (!name) throw new Error(`第 ${index + 1} 个${kind === 'stock' ? '股票' : '基金'}分组名称无效`);
    if (names.includes(name)) throw new Error(`分组名称“${name}”重复`);
    if (!Array.isArray(entry?.codes)) throw new Error(`分组“${name}”的 codes 必须是数组`);
    const seen = new Set<string>();
    const codes = entry.codes.map((rawCode) => {
      if (typeof rawCode !== 'string') throw new Error(`分组“${name}”包含非文本代码`);
      const code = kind === 'stock' ? normalizeStockCode(rawCode) : normalizeFundCode(rawCode);
      const valid = kind === 'stock'
        ? /^(sh|sz|bj|hk|usr_|gb_)[a-z0-9.]+$/i.test(code)
        : /^\d{6}$/.test(code);
      if (!valid) throw new Error(`分组“${name}”包含无效代码：${rawCode}`);
      return code;
    }).filter((code) => {
      const key = code.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    names.push(name);
    lists.push(codes);
  });
  return { names, lists };
}

export function createPortfolioFile(
  stocks = StockEagleEyeConfig.getStockGroupConfig(),
  funds = FundConfig.getFundGroupConfig()
): string {
  const data: PortfolioFile = {
    formatVersion: 1,
    stockGroups: toEntries(stocks),
    fundGroups: toEntries(funds),
  };
  return `${JSON.stringify(data, null, 2)}\n`;
}

export function parsePortfolioFile(text: string): {
  stocks: StockGroupConfig;
  funds: FundGroupConfig;
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.replace(/^\uFEFF/, ''));
  } catch {
    throw new Error('文件不是有效的 JSON');
  }
  const root = asRecord(parsed);
  if (root?.formatVersion !== 1) throw new Error('不支持的配置文件版本');
  return {
    stocks: parseGroups(root.stockGroups, 'stock') as StockGroupConfig,
    funds: parseGroups(root.fundGroups, 'fund') as FundGroupConfig,
  };
}
