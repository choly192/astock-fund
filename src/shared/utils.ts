import { EventEmitter } from 'events';
import { StockTreeItem } from './stockTreeItem';
import { SortType } from './typed';

export const events = new EventEmitter();

export function uniqueCodes(codes: string[]): string[] {
  const seen = new Set<string>();
  return codes.filter((code) => {
    const key = code.toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function calcFixedPriceNumber(...values: Array<string | number>): number {
  const decimals = values.map((value) => {
    const text = String(value ?? '');
    const fraction = text.includes('.') ? text.split('.')[1].replace(/0+$/, '') : '';
    return fraction.length;
  });
  return Math.min(4, Math.max(2, ...decimals));
}

export function formatNumber(
  value: string | number,
  digits = 2,
  compact = true
): string {
  const number = Number(value);
  if (!Number.isFinite(number)) return '--';
  if (compact && Math.abs(number) >= 100000000) {
    return `${(number / 100000000).toFixed(digits)}亿`;
  }
  if (compact && Math.abs(number) >= 10000) {
    return `${(number / 10000).toFixed(digits)}万`;
  }
  return number.toFixed(digits);
}

export function formatLabelString(
  template: string,
  values: Record<string, unknown>
): string {
  return template.replace(/\$\{([^}]+)\}/g, (_match, expression: string) => {
    const [key, operation, widthText] = expression.split('|');
    const value = String(values[key] ?? '');
    if (operation === 'padRight') {
      return value.padEnd(Number(widthText) || value.length, ' ');
    }
    return value;
  });
}

export function sortStockItems(items: StockTreeItem[], order: SortType): StockTreeItem[] {
  if (order === SortType.NORMAL) return items;
  return [...items].sort((left, right) => {
    const a = Number.parseFloat(left.info.percent) || 0;
    const b = Number.parseFloat(right.info.percent) || 0;
    return order === SortType.ASC ? a - b : b - a;
  });
}

export function randHeader(): Record<string, string> {
  return {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36',
  };
}

interface ZonedClock {
  weekday: number;
  hour: number;
  minute: number;
}

export function getZonedClock(value: Date, timeZone: string): ZonedClock {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(value);
  const part = (type: string) => parts.find((item) => item.type === type)?.value || '';
  const weekdays: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return {
    weekday: weekdays[part('weekday')] ?? -1,
    hour: Number(part('hour')),
    minute: Number(part('minute')),
  };
}

function isWeekday(value: ZonedClock): boolean {
  return value.weekday >= 1 && value.weekday <= 5;
}

function isBetweenMinutes(value: ZonedClock, start: number, end: number): boolean {
  const current = value.hour * 60 + value.minute;
  return current >= start && current <= end;
}

function isInSession(value: ZonedClock, sessions: Array<[number, number]>): boolean {
  return sessions.some(([start, end]) => isBetweenMinutes(value, start, end));
}

export function isAnyStockMarketOpen(codes: string[], now = new Date()): boolean {
  if (!codes.length) return false;

  const hasMainlandMarket = codes.some((code) => /^(sh|sz|bj)/i.test(code));
  const hasHongKongMarket = codes.some((code) => /^hk/i.test(code));
  const hasUsMarket = codes.some((code) => /^(usr_|gb_)/i.test(code));

  if (hasMainlandMarket || hasHongKongMarket) {
    const shanghai = getZonedClock(now, 'Asia/Shanghai');
    if (
      hasMainlandMarket &&
      isWeekday(shanghai) &&
      isInSession(shanghai, [
        [9 * 60 + 15, 11 * 60 + 30],
        [13 * 60, 15 * 60 + 10],
      ])
    ) {
      return true;
    }
    if (
      hasHongKongMarket &&
      isWeekday(shanghai) &&
      isInSession(shanghai, [
        [9 * 60, 12 * 60],
        [13 * 60, 16 * 60 + 15],
      ])
    ) {
      return true;
    }
  }

  if (hasUsMarket) {
    const newYork = getZonedClock(now, 'America/New_York');
    if (isWeekday(newYork) && isBetweenMinutes(newYork, 4 * 60, 20 * 60)) {
      return true;
    }
  }

  return false;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
