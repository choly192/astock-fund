import { join } from 'path';
import { ExtensionContext, TreeItem, TreeItemCollapsibleState } from 'vscode';
import { StockInfo } from './typed';

export class StockTreeItem extends TreeItem {
  readonly info: StockInfo;
  readonly type?: string;
  readonly isCategory: boolean;

  constructor(info: StockInfo, context?: ExtensionContext, isCategory = false) {
    super(
      isCategory ? info.name : '',
      isCategory ? TreeItemCollapsibleState.Expanded : TreeItemCollapsibleState.None
    );
    this.info = info;
    this.type = info.type;
    this.isCategory = isCategory;
    this.id = info.id || info.code;
    this.contextValue = info.contextValue || (isCategory ? 'stockGroup' : 'stock');

    if (isCategory) {
      return;
    }

    const percentValue = Number.parseFloat(info.percent);
    const hasPercent = Number.isFinite(percentValue);
    const rising = !hasPercent || percentValue >= 0;
    const percent = hasPercent
      ? `${percentValue >= 0 ? '+' : ''}${percentValue.toFixed(2)}%`
      : '--';
    const iconName = rising
      ? Math.abs(percentValue) >= 2
        ? 'up'
        : 'up1'
      : Math.abs(percentValue) >= 2
      ? 'down'
      : 'down1';

    if (info.type !== 'nodata' && context) {
      this.iconPath = context.asAbsolutePath(join('resources', `${iconName}.svg`));
    }

    this.label = info.name;
    this.description = info.type === 'nodata'
      ? info.code.toUpperCase()
      : `${info.price || '--'}  ${percent}`;

    if (info.type === 'nodata') {
      this.tooltip = `${info.code} 暂无行情数据`;
      return;
    }

    const after = info.afterPrice
      ? `\n盘后：${info.afterPrice}  涨跌幅：${info.afterPercent}%`
      : '';
    this.tooltip =
      `${info.name} (${info.code})\n` +
      `现价：${info.price}  涨跌：${info.updown}  涨跌幅：${percent}\n` +
      `最高：${info.high}  最低：${info.low}\n` +
      `今开：${info.open}  昨收：${info.yestclose}${after}\n` +
      `成交量：${info.volume}  成交额：${info.amount}\n` +
      `行情时间：${info.time || '--'}`;
    this.command = {
      title: '查看股票走势',
      command: 'stock-eagle-eye.stockItemClick',
      arguments: [info],
    };
  }
}
