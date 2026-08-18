import { ExtensionContext, QuickPickItem, window } from 'vscode';
import { getWithRetry, isCanceledRequest } from '../shared/httpClient';
import { StockTreeItem } from '../shared/stockTreeItem';
import { StockInfo } from '../shared/typed';
import {
  calcFixedPriceNumber,
  events,
  formatNumber,
  getZonedClock,
  randHeader,
  uniqueCodes,
} from '../shared/utils';
import {
  getTencentHKStockData,
  getTencentStockData,
  searchStockList,
  TencentStockQuote,
} from '../shared/tencentStock';

type RawStockInfo = Omit<StockInfo, 'percent' | 'updown'>;

export default class StockService {
  public stockList: StockTreeItem[] = [];
  private lastErrorAt = 0;

  constructor(private readonly context: ExtensionContext) {
    const cached = context.globalState.get<StockInfo[]>('stock-eagle-eye.stockQuoteCache', []);
    this.stockList = cached.map(
      (info) => new StockTreeItem({ ...info, stale: true }, this.context)
    );
  }

  async getData(codes: string[]): Promise<StockTreeItem[]> {
    const supportedCodes = uniqueCodes(codes).filter((code) =>
      /^(sh|sz|bj|hk|usr_|gb_)/i.test(code)
    );
    if (!supportedCodes.length) {
      this.updateList([]);
      return [];
    }

    const hkCodes = supportedCodes.filter((code) => /^hk/i.test(code));
    const sinaCodes = supportedCodes.filter((code) => !/^hk/i.test(code));
    const settled = await Promise.allSettled([
      this.getSinaStockData(sinaCodes),
      this.getHKStockData(hkCodes),
    ]);

    const items = settled.flatMap((result) =>
      result.status === 'fulfilled' ? result.value : []
    );
    const itemCodes = new Set(items.map((item) => item.info.code.toLowerCase()));
    const cachedByCode = new Map(
      this.stockList
        .filter((item) => item.info.type !== 'nodata')
        .map((item) => [item.info.code.toLowerCase(), item.info])
    );
    supportedCodes.forEach((code) => {
      if (itemCodes.has(code.toLowerCase())) return;
      const cached = cachedByCode.get(code.toLowerCase());
      items.push(
        cached
          ? new StockTreeItem({ ...cached, stale: true }, this.context)
          : this.createNoDataItem(code)
      );
    });

    this.updateList(items);
    return items;
  }

  private updateList(items: StockTreeItem[]): void {
    const previous = this.stockList;
    this.stockList = items;
    void this.context.globalState.update(
      'stock-eagle-eye.stockQuoteCache',
      items.filter((item) => item.info.type !== 'nodata').map((item) => item.info)
    );
    events.emit('stockListUpdate', items, previous);
  }

  private createNoDataItem(code: string, name = ''): StockTreeItem {
    return new StockTreeItem(
      {
        code: code.toLowerCase(),
        name: name ? `暂无行情：${name}` : `暂无行情：${code}`,
        percent: '--',
        type: 'nodata',
        contextValue: 'nodata',
      },
      this.context
    );
  }

  private createStockItem(raw: RawStockInfo, source: string): StockTreeItem {
    const digits = calcFixedPriceNumber(
      raw.open || 0,
      raw.yestclose || 0,
      raw.price || 0,
      raw.high || 0,
      raw.low || 0
    );
    const yestclose = Number(raw.yestclose) || 0;
    let price = Number(raw.price) || 0;
    if (price <= 0) price = yestclose;
    const updown = price - yestclose;
    const percent = yestclose ? (updown / yestclose) * 100 : Number.NaN;

    return new StockTreeItem(
      {
        ...raw,
        code: raw.code.toLowerCase(),
        open: formatNumber(raw.open || 0, digits, false),
        yestclose: formatNumber(yestclose, digits, false),
        price: formatNumber(price, digits, false),
        high: formatNumber(raw.high || 0, digits, false),
        low: formatNumber(raw.low || 0, digits, false),
        updown: formatNumber(updown, digits, false),
        percent: Number.isFinite(percent) ? percent.toFixed(2) : '--',
        fetchedAt: raw.fetchedAt || Date.now(),
        source,
      },
      this.context
    );
  }

  private async getSinaStockData(codes: string[]): Promise<StockTreeItem[]> {
    if (!codes.length) return [];
    const requestCodes = codes.map((code) => code.replace('.', '$'));
    const url = `https://hq.sinajs.cn/list=${requestCodes.join(',')}`;

    try {
      const response = await getWithRetry<ArrayBuffer>(url, {
        responseType: 'arraybuffer',
        headers: { ...randHeader(), Referer: 'http://finance.sina.com.cn/' },
      });
      const responseText = new TextDecoder('gb18030').decode(response.data);
      if (/FAILED/.test(responseText)) throw new Error('Sina quote request failed');

      const newYork = getZonedClock(new Date(), 'America/New_York');
      const minutes = newYork.hour * 60 + newYork.minute;
      const isPreMarket = minutes >= 4 * 60 && minutes < 9 * 60 + 30;
      const isMainMarket = minutes >= 9 * 60 + 30 && minutes < 16 * 60;
      const isAfterMarket = minutes >= 16 * 60 && minutes < 20 * 60;
      const items: StockTreeItem[] = [];

      responseText
        .split('";')
        .map((record) => record.trim())
        .filter(Boolean)
        .forEach((record) => {
          const match = record.match(/var hq_str_(.+?)="([\s\S]*)/);
          if (!match) return;
          const code = match[1].replace('$', '.').toLowerCase();
          const params = match[2].split(',');
          if (params.length <= 1) {
            items.push(this.createNoDataItem(code));
            return;
          }

          if (/^(sh|sz|bj)/.test(code)) {
            const yestclose = params[2];
            const price = Number(params[3]) || Number(params[6]) || Number(yestclose);
            items.push(
              this.createStockItem({
                code,
                name: params[0],
                type: code.slice(0, 2),
                symbol: code.slice(2),
                contextValue: 'stock',
                open: params[1],
                yestclose,
                price: String(price),
                high: params[4],
                low: params[5],
                volume: formatNumber(params[8], 2),
                amount: formatNumber(params[9], 2),
                time: `${params[30] || ''} ${params[31] || ''}`.trim(),
              }, '新浪财经')
            );
            return;
          }

          if (/^usr_/.test(code)) {
            let price = params[1];
            let yestclose = params[26];
            let afterPrice = '';
            let afterPercent = '';
            if (isPreMarket) {
              price = Number(params[21]) ? params[21] : price;
              yestclose = Number(params[35]) ? params[35] : yestclose;
            } else if (isAfterMarket) {
              price = Number(params[21]) ? params[21] : price;
              yestclose = Number(params[1]) ? params[1] : yestclose;
            } else if (!isMainMarket && Number(params[21])) {
              afterPrice = params[21];
              afterPercent = params[22];
            }
            items.push(
              this.createStockItem({
                code,
                name: params[0],
                type: 'usr_',
                symbol: code.slice(4),
                contextValue: 'stock',
                open: params[5],
                yestclose,
                price,
                high: params[6],
                low: params[7],
                volume: formatNumber(params[10], 2),
                amount: '接口无数据',
                time: params[3],
                afterPrice,
                afterPercent,
              }, '新浪财经')
            );
            return;
          }

          if (/^gb_/.test(code)) {
            items.push(
              this.createStockItem({
                code,
                name: params[0],
                type: 'gb_',
                symbol: code.slice(3),
                contextValue: 'stock',
                open: params[5],
                yestclose: params[26],
                price: params[1],
                high: params[6],
                low: params[7],
                volume: formatNumber(params[10], 2),
                amount: '接口无数据',
                time: params[3],
              }, '新浪财经')
            );
          }
        });

      return items;
    } catch (error) {
      console.warn('Sina quote request failed, falling back to Tencent', error);
      try {
        return (await getTencentStockData(codes)).map((item) =>
          item.name === 'NODATA' ? this.createNoDataItem(item.code) : this.createTencentStockItem(item)
        );
      } catch (fallbackError) {
        this.reportError('股票行情获取失败，请检查网络后重试', fallbackError);
        return [];
      }
    }
  }

  private createTencentStockItem(item: TencentStockQuote): StockTreeItem {
    const type = item.code.startsWith('usr_')
      ? 'usr_'
      : item.code.startsWith('gb_')
      ? 'gb_'
      : item.code.slice(0, 2);
    const symbol = type === 'usr_'
      ? item.code.slice(4)
      : type === 'gb_'
      ? item.code.slice(3)
      : item.code.slice(2);
    return this.createStockItem({
      ...item,
      type,
      symbol,
      contextValue: 'stock',
      volume: formatNumber(item.volume || 0, 2),
      amount: item.amount ? formatNumber(item.amount, 2) : '接口无数据',
      time: this.formatTencentTime(item.time),
    }, '腾讯财经');
  }

  private async getHKStockData(codes: string[]): Promise<StockTreeItem[]> {
    if (!codes.length) return [];
    try {
      const stocks = await getTencentHKStockData(codes);
      return stocks.map((item: any) => {
        if (item.name === 'NODATA') return this.createNoDataItem(item.code);
        return this.createStockItem({
          ...item,
          code: item.code,
          type: 'hk',
          symbol: item.code.replace(/^hk/i, ''),
          contextValue: 'stock',
          volume: formatNumber(item.volume || 0, 2),
          amount: formatNumber(item.amount || 0, 2),
          time: this.formatDateTime(item.time),
        }, '腾讯财经');
      });
    } catch (error) {
      this.reportError('港股行情获取失败，请检查网络后重试', error);
      return [];
    }
  }

  private formatDateTime(value: unknown): string {
    const date = new Date(String(value || ''));
    if (!Number.isFinite(date.getTime())) return String(value || '--');
    const parts = new Intl.DateTimeFormat('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date);
    const part = (type: string) => parts.find((item) => item.type === type)?.value || '';
    return `${part('year')}-${part('month')}-${part('day')} ${part('hour')}:${part('minute')}:${part('second')}`;
  }

  private formatTencentTime(value: unknown): string {
    const text = String(value || '');
    const match = text.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/);
    if (!match) return text || '--';
    return `${match[1]}-${match[2]}-${match[3]} ${match[4]}:${match[5]}:${match[6]}`;
  }

  private reportError(message: string, error: unknown): void {
    console.error(error);
    if (Date.now() - this.lastErrorAt < 5 * 60 * 1000) return;
    this.lastErrorAt = Date.now();
    window.showErrorMessage(message);
  }

  async getStockSuggestList(
    searchText = '',
    signal?: AbortSignal
  ): Promise<QuickPickItem[]> {
    if (signal?.aborted) return [];
    if (!searchText.trim()) return [{ label: '请输入股票代码或名称' }];
    try {
      const stocks = await searchStockList(searchText.trim(), signal);
      return stocks.flatMap((item) => {
        const { code, name, market } = item;
        if (['sz', 'sh', 'bj', 'hk'].includes(market)) {
          return [
            {
              label: `${market}${code} | ${name}`,
              description: market === 'hk' ? '港股' : 'A股',
            },
          ];
        }
        if (market === 'us') {
          const symbol = String(code).split('.').slice(0, -1).join('.') || code;
          return [{ label: `us${symbol} | ${name}`, description: '美股' }];
        }
        return [];
      });
    } catch (error) {
      if (signal?.aborted || isCanceledRequest(error)) return [];
      console.error(error);
      return [{ label: '股票查询失败，请重试' }];
    }
  }
}
