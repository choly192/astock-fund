import { commands, Disposable, ExtensionContext, window } from 'vscode';
import { StockTreeItem } from '../shared/stockTreeItem';
import { StockInfo } from '../shared/typed';
import { events } from '../shared/utils';

export type StockAlertCondition = 'priceAbove' | 'priceBelow' | 'percentAbove' | 'percentBelow';

export interface StockAlertRule {
  id: string;
  code: string;
  name: string;
  condition: StockAlertCondition;
  value: number;
  enabled: boolean;
  active: boolean;
  createdAt: number;
  lastTriggeredAt?: number;
}

const STORAGE_KEY = 'stock-eagle-eye.stockAlerts';

export function matchesStockAlert(rule: StockAlertRule, info: StockInfo): boolean {
  const price = Number(info.price);
  const percent = Number(info.percent);
  if (rule.condition === 'priceAbove') return Number.isFinite(price) && price >= rule.value;
  if (rule.condition === 'priceBelow') return Number.isFinite(price) && price <= rule.value;
  if (rule.condition === 'percentAbove') return Number.isFinite(percent) && percent >= rule.value;
  return Number.isFinite(percent) && percent <= rule.value;
}

export function describeStockAlert(rule: StockAlertRule): string {
  const value = rule.condition.startsWith('percent')
    ? `${rule.value.toFixed(2)}%`
    : rule.value.toFixed(2);
  const labels: Record<StockAlertCondition, string> = {
    priceAbove: '价格达到',
    priceBelow: '价格跌到',
    percentAbove: '涨跌幅达到',
    percentBelow: '涨跌幅跌到',
  };
  return `${labels[rule.condition]} ${value}`;
}

export class StockAlertManager implements Disposable {
  private rules: StockAlertRule[];
  private readonly updateListener = (items: StockTreeItem[]) => this.evaluate(items);

  constructor(private readonly context: ExtensionContext) {
    this.rules = context.globalState.get<StockAlertRule[]>(STORAGE_KEY, []);
    events.on('stockListUpdate', this.updateListener);
  }

  getRules(): StockAlertRule[] {
    return this.rules.map((rule) => ({ ...rule }));
  }

  async setRule(info: StockInfo, condition: StockAlertCondition, value: number): Promise<void> {
    const existing = this.rules.find(
      (rule) => rule.code.toLowerCase() === info.code.toLowerCase() && rule.condition === condition
    );
    if (existing) {
      existing.name = info.name;
      existing.value = value;
      existing.enabled = true;
      existing.active = false;
    } else {
      this.rules.push({
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        code: info.code.toLowerCase(),
        name: info.name,
        condition,
        value,
        enabled: true,
        active: false,
        createdAt: Date.now(),
      });
    }
    await this.save();
  }

  async toggle(id: string): Promise<void> {
    const rule = this.rules.find((item) => item.id === id);
    if (!rule) return;
    rule.enabled = !rule.enabled;
    rule.active = false;
    await this.save();
  }

  async remove(id: string): Promise<void> {
    this.rules = this.rules.filter((rule) => rule.id !== id);
    await this.save();
  }

  dispose(): void {
    events.off('stockListUpdate', this.updateListener);
  }

  private evaluate(items: StockTreeItem[]): void {
    const byCode = new Map(items.map((item) => [item.info.code.toLowerCase(), item.info]));
    let changed = false;
    this.rules.forEach((rule) => {
      if (!rule.enabled) return;
      const info = byCode.get(rule.code.toLowerCase());
      if (!info || info.stale || info.type === 'nodata') return;
      const matched = matchesStockAlert(rule, info);
      if (!matched) {
        if (rule.active) {
          rule.active = false;
          changed = true;
        }
        return;
      }
      if (rule.active) return;
      rule.active = true;
      rule.lastTriggeredAt = Date.now();
      changed = true;
      const current = rule.condition.startsWith('percent')
        ? `${Number(info.percent).toFixed(2)}%`
        : Number(info.price).toFixed(2);
      void window.showWarningMessage(
        `${rule.name}：${describeStockAlert(rule)}，当前 ${current}`,
        '查看行情'
      ).then((answer) => {
        if (answer === '查看行情') {
          void commands.executeCommand('stock-eagle-eye.stockItemClick', info);
        }
      });
    });
    if (changed) void this.save();
  }

  private async save(): Promise<void> {
    await this.context.globalState.update(STORAGE_KEY, this.rules);
  }
}
