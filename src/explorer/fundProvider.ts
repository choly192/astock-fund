import { Event, EventEmitter, ExtensionContext, TreeDataProvider, TreeItem } from 'vscode';
import { FundConfig } from '../shared/fundConfig';
import { FundTreeItem } from '../shared/fundTreeItem';
import { StockEagleEyeConfig } from '../shared/stockEagleEyeConfig';
import { SortType } from '../shared/typed';
import FundService from './fundService';

export class FundProvider implements TreeDataProvider<FundTreeItem> {
  private readonly emitter = new EventEmitter<FundTreeItem | undefined>();
  readonly onDidChangeTreeData: Event<FundTreeItem | undefined> = this.emitter.event;
  private order: SortType;

  constructor(
    private readonly service: FundService,
    private readonly context: ExtensionContext
  ) {
    this.order = StockEagleEyeConfig.getConfig<SortType>(
      'stock-eagle-eye.fundSort',
      SortType.NORMAL
    );
  }

  refresh(): void {
    this.emitter.fire(undefined);
  }

  getTreeItem(element: FundTreeItem): TreeItem {
    return element;
  }

  getChildren(element?: FundTreeItem): FundTreeItem[] {
    const config = FundConfig.getFundGroupConfig();
    if (!element) {
      return config.names.map((name, groupIndex) => {
        const codes = config.lists[groupIndex];
        return new FundTreeItem({
          id: `fundGroup_${groupIndex}`,
          groupIndex,
          code: '',
          name: `${name}${codes.length ? ` (${codes.length})` : ''}`,
          netValue: '',
          percent: '',
          contextValue: 'fundGroup',
        }, undefined, true);
      });
    }

    const groupIndex = element.info.groupIndex;
    if (groupIndex === undefined || !config.lists[groupIndex]) return [];
    const byCode = new Map(this.service.fundList.map((item) => [item.info.code, item]));
    const items = config.lists[groupIndex]
      .map((code) => byCode.get(code))
      .filter((item): item is FundTreeItem => Boolean(item))
      .map((item) => new FundTreeItem({
        ...item.info,
        id: `fundGroup_${groupIndex}_${item.info.code}`,
        groupIndex,
      }, this.context));
    if (this.order === SortType.NORMAL) return items;
    return [...items].sort((left, right) => {
      const a = Number.parseFloat(left.info.percent) || 0;
      const b = Number.parseFloat(right.info.percent) || 0;
      return this.order === SortType.ASC ? a - b : b - a;
    });
  }

  changeOrder(): SortType {
    this.order = this.order === SortType.NORMAL
      ? SortType.ASC
      : this.order === SortType.ASC ? SortType.DESC : SortType.NORMAL;
    void StockEagleEyeConfig.setConfig('stock-eagle-eye.fundSort', this.order);
    this.refresh();
    return this.order;
  }
}
