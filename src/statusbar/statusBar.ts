import { StatusBarAlignment, StatusBarItem, window } from 'vscode';
import StockService from '../explorer/stockService';
import { DEFAULT_LABEL_FORMAT } from '../shared/constant';
import { StockEagleEyeConfig } from '../shared/stockEagleEyeConfig';
import { StockTreeItem } from '../shared/stockTreeItem';
import { events, formatLabelString } from '../shared/utils';

export class StatusBar {
  private items: StatusBarItem[] = [];
  private readonly updateListener = () => this.refresh();

  constructor(private readonly service: StockService) {
    events.on('stockListUpdate', this.updateListener);
    this.refresh();
  }

  refresh(): void {
    if (StockEagleEyeConfig.getConfig<boolean>('stock-eagle-eye.hideStatusBar', false)) {
      this.clear();
      return;
    }

    const configured = StockEagleEyeConfig.getConfig<string[]>('stock-eagle-eye.statusBarStock', []);
    const byCode = new Map(
      this.service.stockList.map((item) => [item.info.code.toLowerCase(), item])
    );
    const stocks = configured
      .map((code) => byCode.get(code.toLowerCase()))
      .filter((item): item is StockTreeItem => Boolean(item));

    while (this.items.length < stocks.length) {
      this.items.push(window.createStatusBarItem(StatusBarAlignment.Left, 3));
    }
    while (this.items.length > stocks.length) {
      this.items.pop()?.dispose();
    }
    stocks.forEach((stock, index) => this.updateItem(this.items[index], stock));
  }

  private updateItem(item: StatusBarItem, stock: StockTreeItem): void {
    const info = stock.info;
    const percentValue = Number.parseFloat(info.percent);
    const rising = !Number.isFinite(percentValue) || percentValue >= 0;
    const icon = StockEagleEyeConfig.getConfig<boolean>('stock-eagle-eye.hideStatusBarIcon', false)
      ? ''
      : rising
      ? '$(arrow-up)'
      : '$(arrow-down)';
    const formats = StockEagleEyeConfig.getConfig<Record<string, string>>(
      'stock-eagle-eye.labelFormat',
      DEFAULT_LABEL_FORMAT
    );
    item.text = formatLabelString(
      formats.statusBarLabelFormat || DEFAULT_LABEL_FORMAT.statusBarLabelFormat,
      {
        ...info,
        icon,
        percent: Number.isFinite(percentValue)
          ? `${percentValue >= 0 ? '+' : ''}${percentValue.toFixed(2)}%`
          : '--',
      }
    );
    item.color = StockEagleEyeConfig.getConfig<string>(
      rising ? 'stock-eagle-eye.riseColor' : 'stock-eagle-eye.fallColor',
      rising ? '#f14c4c' : '#89d185'
    );
    item.tooltip = stock.tooltip;
    item.command = {
      title: '查看股票走势',
      command: 'stock-eagle-eye.stockItemClick',
      arguments: [info],
    };
    item.show();
  }

  toggleVisibility(): void {
    const hidden = StockEagleEyeConfig.getConfig<boolean>('stock-eagle-eye.hideStatusBar', false);
    void StockEagleEyeConfig.setConfig('stock-eagle-eye.hideStatusBar', !hidden);
  }

  toggleIconVisibility(): void {
    const hidden = StockEagleEyeConfig.getConfig<boolean>('stock-eagle-eye.hideStatusBarIcon', false);
    void StockEagleEyeConfig.setConfig('stock-eagle-eye.hideStatusBarIcon', !hidden);
  }

  dispose(): void {
    events.off('stockListUpdate', this.updateListener);
    this.clear();
  }

  private clear(): void {
    this.items.forEach((item) => item.dispose());
    this.items = [];
  }
}
