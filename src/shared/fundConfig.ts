import { FundGroupConfig } from './typed';
import { uniqueCodes } from './utils';
import { StockEagleEyeConfig } from './stockEagleEyeConfig';

const DEFAULT_FUND_GROUP_NAME = '我的基金';

export function normalizeFundCode(code: string): string {
  const value = code.trim();
  return /^\d{6}$/.test(value) ? value : '';
}

export function parseFundCodeInput(input: string): { codes: string[]; invalid: string[] } {
  const values = input.split(/[\s,，;；]+/).map((item) => item.trim()).filter(Boolean);
  const invalid = values.filter((value) => !normalizeFundCode(value));
  return {
    codes: uniqueCodes(values.map(normalizeFundCode).filter(Boolean)),
    invalid,
  };
}

function normalizeNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeLists(value: unknown): string[][] {
  if (!Array.isArray(value) || !value.length) return [];
  const rawLists = value.every((item) => typeof item === 'string') ? [value] : value;
  return rawLists.filter(Array.isArray).map((list) =>
    uniqueCodes(
      list
        .filter((item): item is string => typeof item === 'string')
        .map(normalizeFundCode)
        .filter(Boolean)
    )
  );
}

function cloneConfig(config: FundGroupConfig): FundGroupConfig {
  return { names: [...config.names], lists: config.lists.map((list) => [...list]) };
}

export function normalizeFundGroupConfig(rawFunds: unknown, rawNames: unknown): FundGroupConfig {
  const names = normalizeNames(rawNames);
  const lists = normalizeLists(rawFunds);
  if (!names.length) {
    if (!lists.length) return { names: [], lists: [] };
    return { names: [DEFAULT_FUND_GROUP_NAME], lists: [uniqueCodes(lists.flat())] };
  }

  while (lists.length < names.length) lists.push([]);
  if (lists.length > names.length) {
    const extraLists = lists.splice(names.length);
    lists[0] = uniqueCodes([...lists[0], ...extraLists.flat()]);
  }

  const seen = new Set<string>();
  return {
    names,
    lists: lists.map((list) =>
      list.filter((code) => {
        if (seen.has(code)) return false;
        seen.add(code);
        return true;
      })
    ),
  };
}

export function addFundToGroup(
  config: FundGroupConfig,
  groupIndex: number,
  code: string
): FundGroupConfig {
  const next = cloneConfig(config);
  const normalized = normalizeFundCode(code);
  if (!normalized || !next.lists[groupIndex]) return next;
  next.lists = next.lists.map((list) => list.filter((item) => item !== normalized));
  next.lists[groupIndex].push(normalized);
  return next;
}

export function moveFundWithinGroup(
  config: FundGroupConfig,
  groupIndex: number,
  code: string,
  offset: -1 | 1
): FundGroupConfig {
  const next = cloneConfig(config);
  const list = next.lists[groupIndex];
  if (!list) return next;
  const current = list.indexOf(code);
  const target = current + offset;
  if (current < 0 || target < 0 || target >= list.length) return next;
  [list[current], list[target]] = [list[target], list[current]];
  return next;
}

export function removeFundGroupAt(
  config: FundGroupConfig,
  groupIndex: number
): FundGroupConfig {
  const next = cloneConfig(config);
  const removedCodes = next.lists[groupIndex] || [];
  next.names.splice(groupIndex, 1);
  next.lists.splice(groupIndex, 1);
  if (!next.names.length) return { names: [], lists: [] };
  next.lists[0] = uniqueCodes([...next.lists[0], ...removedCodes]);
  return next;
}

export class FundConfig {
  static getFundGroupConfig(): FundGroupConfig {
    return normalizeFundGroupConfig(
      StockEagleEyeConfig.getConfig<unknown>('stock-eagle-eye.funds', []),
      StockEagleEyeConfig.getConfig<unknown>('stock-eagle-eye.fundGroups', [])
    );
  }

  static async migrateFundGroups(): Promise<FundGroupConfig> {
    const rawFunds = StockEagleEyeConfig.getConfig<unknown>('stock-eagle-eye.funds', []);
    const rawNames = StockEagleEyeConfig.getConfig<unknown>('stock-eagle-eye.fundGroups', []);
    const normalized = normalizeFundGroupConfig(rawFunds, rawNames);
    const writes: Thenable<void>[] = [];
    if (JSON.stringify(rawFunds) !== JSON.stringify(normalized.lists)) {
      writes.push(StockEagleEyeConfig.setConfig('stock-eagle-eye.funds', normalized.lists));
    }
    if (JSON.stringify(rawNames) !== JSON.stringify(normalized.names)) {
      writes.push(StockEagleEyeConfig.setConfig('stock-eagle-eye.fundGroups', normalized.names));
    }
    await Promise.all(writes);
    return normalized;
  }

  static getAllFundCodes(): string[] {
    return uniqueCodes(this.getFundGroupConfig().lists.flat());
  }

  static async saveFundGroupConfig(config: FundGroupConfig): Promise<void> {
    await Promise.all([
      StockEagleEyeConfig.setConfig('stock-eagle-eye.fundGroups', config.names),
      StockEagleEyeConfig.setConfig('stock-eagle-eye.funds', config.lists),
    ]);
  }

  static async addFundGroup(name: string): Promise<void> {
    const config = this.getFundGroupConfig();
    if (config.names.includes(name)) throw new Error('分组名称已存在');
    config.names.push(name);
    config.lists.push([]);
    await this.saveFundGroupConfig(config);
  }

  static async renameFundGroup(groupIndex: number, name: string): Promise<void> {
    const config = this.getFundGroupConfig();
    if (config.names.some((item, index) => item === name && index !== groupIndex)) {
      throw new Error('分组名称已存在');
    }
    if (!config.names[groupIndex]) return;
    config.names[groupIndex] = name;
    await this.saveFundGroupConfig(config);
  }

  static async removeFundGroup(groupIndex: number): Promise<void> {
    await this.saveFundGroupConfig(removeFundGroupAt(this.getFundGroupConfig(), groupIndex));
  }

  static async addFund(groupIndex: number, code: string): Promise<void> {
    await this.saveFundGroupConfig(addFundToGroup(this.getFundGroupConfig(), groupIndex, code));
  }

  static async addFunds(groupIndex: number, codes: string[]): Promise<void> {
    const config = codes.reduce(
      (current, code) => addFundToGroup(current, groupIndex, code),
      this.getFundGroupConfig()
    );
    await this.saveFundGroupConfig(config);
  }

  static async removeFund(groupIndex: number, code: string): Promise<void> {
    const config = this.getFundGroupConfig();
    if (!config.lists[groupIndex]) return;
    config.lists[groupIndex] = config.lists[groupIndex].filter((item) => item !== code);
    await this.saveFundGroupConfig(config);
  }

  static async moveFund(targetGroupIndex: number, code: string): Promise<void> {
    await this.saveFundGroupConfig(addFundToGroup(this.getFundGroupConfig(), targetGroupIndex, code));
  }

  static async setFundTop(groupIndex: number, code: string): Promise<void> {
    const config = this.getFundGroupConfig();
    const list = config.lists[groupIndex];
    if (!list) return;
    config.lists[groupIndex] = [code, ...list.filter((item) => item !== code)];
    await this.saveFundGroupConfig(config);
  }

  static async moveFundByOffset(
    groupIndex: number,
    code: string,
    offset: -1 | 1
  ): Promise<void> {
    await this.saveFundGroupConfig(
      moveFundWithinGroup(this.getFundGroupConfig(), groupIndex, code, offset)
    );
  }
}
