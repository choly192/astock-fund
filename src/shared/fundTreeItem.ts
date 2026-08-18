import { join } from 'path';
import { ExtensionContext, TreeItem, TreeItemCollapsibleState } from 'vscode';
import { FundInfo } from './typed';

export class FundTreeItem extends TreeItem {
  readonly info: FundInfo;
  readonly isCategory: boolean;

  constructor(info: FundInfo, context?: ExtensionContext, isCategory = false) {
    super(
      isCategory ? info.name : '',
      isCategory ? TreeItemCollapsibleState.Expanded : TreeItemCollapsibleState.None
    );
    this.info = info;
    this.isCategory = isCategory;
    this.id = info.id || info.code;
    this.contextValue = info.contextValue || (isCategory ? 'fundGroup' : 'fund');
    if (isCategory) {
      return;
    }

    const percentValue = Number.parseFloat(info.percent);
    const hasPercent = Number.isFinite(percentValue);
    const percent = hasPercent
      ? `${percentValue >= 0 ? '+' : ''}${percentValue.toFixed(2)}%`
      : '--';
    const iconName = !hasPercent || percentValue >= 0
      ? Math.abs(percentValue) >= 2 ? 'up' : 'up1'
      : Math.abs(percentValue) >= 2 ? 'down' : 'down1';

    if (info.type !== 'nodata' && context) {
      this.iconPath = context.asAbsolutePath(join('resources', `${iconName}.svg`));
    }
    this.label = info.name;
    this.description = info.type === 'nodata'
      ? info.code
      : `${info.netValue}  ${percent}`;
    this.tooltip = info.type === 'nodata'
      ? `${info.code} 暂无净值数据`
      : `${info.name} (${info.code})\n` +
        `单位净值：${info.netValue}  累计净值：${info.cumulativeNetValue || '--'}\n` +
        `日涨跌幅：${percent}  净值日期：${info.date || '--'}\n` +
        `基金类型：${info.fundType || '--'}`;
    if (info.type !== 'nodata') {
      this.command = {
        title: '查看基金净值走势',
        command: 'stock-eagle-eye.fundItemClick',
        arguments: [info],
      };
    }
  }
}
