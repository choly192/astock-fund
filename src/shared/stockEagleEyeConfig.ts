import { ConfigurationTarget, workspace } from 'vscode';
import { StockGroupConfig } from './typed';
import { uniqueCodes } from './utils';

const DEFAULT_GROUP_NAME = '指数';

export function normalizeStockCode(code: string): string {
  const value = code.trim();
  if (/^(sh|sz|bj|hk|usr_|gb_)/i.test(value)) return value.toLowerCase();
  return value;
}

export function normalizeStockInputCode(code: string): string {
  const value = code.trim();
  if (!value) return '';
  const normalized = normalizeStockCode(value);
  if (/^(sh|sz|bj|hk|usr_|gb_)[a-z0-9.]+$/i.test(normalized)) return normalized;
  if (/^\d{6}$/.test(value)) {
    if (/^[569]/.test(value)) return `sh${value}`;
    if (/^[48]/.test(value)) return `bj${value}`;
    return `sz${value}`;
  }
  if (/^\d{5}$/.test(value)) return `hk${value}`;
  if (/^[a-z][a-z0-9.-]*$/i.test(value)) return `usr_${value.toLowerCase()}`;
  return '';
}

export function parseStockCodeInput(input: string): { codes: string[]; invalid: string[] } {
  const values = input.split(/[\s,，;；]+/).map((item) => item.trim()).filter(Boolean);
  const invalid: string[] = [];
  const codes = uniqueCodes(values.flatMap((value) => {
    const code = normalizeStockInputCode(value);
    if (!code) invalid.push(value);
    return code ? [code] : [];
  }));
  return { codes, invalid };
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
        .map(normalizeStockCode)
        .filter((code) => /^(sh|sz|bj|hk|usr_|gb_)/i.test(code))
    )
  );
}

function cloneConfig(config: StockGroupConfig): StockGroupConfig {
  return {
    names: [...config.names],
    lists: config.lists.map((list) => [...list]),
  };
}

export function normalizeStockGroupConfig(rawStocks: unknown, rawNames: unknown): StockGroupConfig {
  const names = normalizeNames(rawNames);
  const lists = normalizeLists(rawStocks);

  if (!names.length) {
    if (!lists.length) return { names: [], lists: [] };
    return { names: [DEFAULT_GROUP_NAME], lists: [uniqueCodes(lists.flat())] };
  }

  while (lists.length < names.length) lists.push([]);
  if (lists.length > names.length) {
    const extraLists = lists.splice(names.length);
    lists[0] = uniqueCodes([...lists[0], ...extraLists.flat()]);
  }

  const seen = new Set<string>();
  const uniqueLists = lists.map((list) =>
    list.filter((code) => {
      const key = code.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
  );

  return { names, lists: uniqueLists };
}

export function addStockToGroup(
  config: StockGroupConfig,
  groupIndex: number,
  code: string
): StockGroupConfig {
  const next = cloneConfig(config);
  const normalized = normalizeStockCode(code);
  if (!normalized || !next.lists[groupIndex]) return next;
  next.lists = next.lists.map((list) => list.filter((item) => item !== normalized));
  next.lists[groupIndex].push(normalized);
  return next;
}

export function moveStockWithinGroup(
  config: StockGroupConfig,
  groupIndex: number,
  code: string,
  offset: -1 | 1
): StockGroupConfig {
  const next = cloneConfig(config);
  const list = next.lists[groupIndex];
  const current = list.indexOf(code);
  const target = current + offset;
  if (current < 0 || target < 0 || target >= list.length) return next;
  [list[current], list[target]] = [list[target], list[current]];
  return next;
}

export function removeStockGroupAt(config: StockGroupConfig, groupIndex: number): StockGroupConfig {
  const next = cloneConfig(config);
  const removedCodes = next.lists[groupIndex] || [];
  next.names.splice(groupIndex, 1);
  next.lists.splice(groupIndex, 1);
  if (!next.names.length) return { names: [], lists: [] };
  next.lists[0] = uniqueCodes([...next.lists[0], ...removedCodes]);
  return next;
}

export class StockEagleEyeConfig {
  static getConfig<T>(key: string, fallback?: T): T {
    return workspace.getConfiguration().get<T>(key, fallback as T);
  }

  static setConfig(key: string, value: unknown): Thenable<void> {
    return workspace.getConfiguration().update(key, value, ConfigurationTarget.Global);
  }

  static getStockGroupConfig(): StockGroupConfig {
    return normalizeStockGroupConfig(
      this.getConfig<unknown>('stock-eagle-eye.stocks', []),
      this.getConfig<unknown>('stock-eagle-eye.stockGroups', [])
    );
  }

  static async migrateStockGroups(): Promise<StockGroupConfig> {
    const rawStocks = this.getConfig<unknown>('stock-eagle-eye.stocks', []);
    const rawNames = this.getConfig<unknown>('stock-eagle-eye.stockGroups', []);
    const normalized = normalizeStockGroupConfig(rawStocks, rawNames);
    const writes: Thenable<void>[] = [];

    if (JSON.stringify(rawStocks) !== JSON.stringify(normalized.lists)) {
      writes.push(this.setConfig('stock-eagle-eye.stocks', normalized.lists));
    }
    if (JSON.stringify(rawNames) !== JSON.stringify(normalized.names)) {
      writes.push(this.setConfig('stock-eagle-eye.stockGroups', normalized.names));
    }
    await Promise.all(writes);
    return normalized;
  }

  static getAllStockCodes(): string[] {
    return uniqueCodes(this.getStockGroupConfig().lists.flat());
  }

  static async saveStockGroupConfig(config: StockGroupConfig): Promise<void> {
    await Promise.all([
      this.setConfig('stock-eagle-eye.stockGroups', config.names),
      this.setConfig('stock-eagle-eye.stocks', config.lists),
    ]);
  }

  static async addStockGroup(name: string): Promise<void> {
    const config = this.getStockGroupConfig();
    if (config.names.includes(name)) throw new Error('分组名称已存在');
    config.names.push(name);
    config.lists.push([]);
    await this.saveStockGroupConfig(config);
  }

  static async renameStockGroup(groupIndex: number, name: string): Promise<void> {
    const config = this.getStockGroupConfig();
    if (config.names.some((item, index) => item === name && index !== groupIndex)) {
      throw new Error('分组名称已存在');
    }
    config.names[groupIndex] = name;
    await this.saveStockGroupConfig(config);
  }

  static async removeStockGroup(groupIndex: number): Promise<void> {
    await this.saveStockGroupConfig(removeStockGroupAt(this.getStockGroupConfig(), groupIndex));
  }

  static async addStock(groupIndex: number, code: string): Promise<void> {
    await this.saveStockGroupConfig(addStockToGroup(this.getStockGroupConfig(), groupIndex, code));
  }

  static async addStocks(groupIndex: number, codes: string[]): Promise<void> {
    const config = codes.reduce(
      (current, code) => addStockToGroup(current, groupIndex, code),
      this.getStockGroupConfig()
    );
    await this.saveStockGroupConfig(config);
  }

  static async removeStock(groupIndex: number, code: string): Promise<void> {
    const config = this.getStockGroupConfig();
    config.lists[groupIndex] = config.lists[groupIndex].filter((item) => item !== code);
    await this.saveStockGroupConfig(config);
  }

  static async moveStock(targetGroupIndex: number, code: string): Promise<void> {
    await this.saveStockGroupConfig(
      addStockToGroup(this.getStockGroupConfig(), targetGroupIndex, code)
    );
  }

  static async setStockTop(groupIndex: number, code: string): Promise<void> {
    const config = this.getStockGroupConfig();
    const list = config.lists[groupIndex];
    config.lists[groupIndex] = [code, ...list.filter((item) => item !== code)];
    await this.saveStockGroupConfig(config);
  }

  static async moveStockByOffset(groupIndex: number, code: string, offset: -1 | 1): Promise<void> {
    await this.saveStockGroupConfig(
      moveStockWithinGroup(this.getStockGroupConfig(), groupIndex, code, offset)
    );
  }

  static async updateStatusBarStocks(codes: string[]): Promise<void> {
    await this.setConfig(
      'stock-eagle-eye.statusBarStock',
      uniqueCodes(codes.map(normalizeStockCode)).slice(0, 4)
    );
  }
}
