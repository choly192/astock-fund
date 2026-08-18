import { Event, EventEmitter, ExtensionContext, TreeDataProvider, TreeItem } from 'vscode';
import { StockEagleEyeConfig } from '../shared/stockEagleEyeConfig';
import { StockTreeItem } from '../shared/stockTreeItem';
import { SortType } from '../shared/typed';
import { sortStockItems } from '../shared/utils';
import StockService from './stockService';

export class StockProvider implements TreeDataProvider<StockTreeItem> {
  private readonly emitter = new EventEmitter<StockTreeItem | undefined>();
  readonly onDidChangeTreeData: Event<StockTreeItem | undefined> = this.emitter.event;
  private order: SortType;

  constructor(
    private readonly service: StockService,
    private readonly context: ExtensionContext
  ) {
    this.order = StockEagleEyeConfig.getConfig<SortType>('stock-eagle-eye.stockSort', SortType.NORMAL);
  }

  refresh(): void {
    this.emitter.fire(undefined);
  }

  getTreeItem(element: StockTreeItem): TreeItem {
    return element;
  }

  getChildren(element?: StockTreeItem): StockTreeItem[] {
    const config = StockEagleEyeConfig.getStockGroupConfig();
    if (!element) {
      return config.names.map(
        (name, groupIndex) => {
          const codes = config.lists[groupIndex];
          return new StockTreeItem(
            {
              id: `stockGroup_${groupIndex}`,
              groupIndex,
              code: '',
              name: `${name}${codes.length ? ` (${codes.length})` : ''}`,
              percent: '',
              contextValue: 'stockGroup',
            },
            undefined,
            true
          );
        }
      );
    }

    const groupIndex = element.info.groupIndex;
    if (groupIndex === undefined || !config.lists[groupIndex]) return [];
    const byCode = new Map(
      this.service.stockList.map((item) => [item.info.code.toLowerCase(), item])
    );
    const items = config.lists[groupIndex]
      .map((code) => byCode.get(code.toLowerCase()))
      .filter((item): item is StockTreeItem => Boolean(item))
      .map(
        (item) =>
          new StockTreeItem(
            {
              ...item.info,
              id: `stockGroup_${groupIndex}_${item.info.code}`,
              groupIndex,
            },
            this.context
          )
      );
    return sortStockItems(items, this.order);
  }

  changeOrder(): SortType {
    this.order =
      this.order === SortType.NORMAL
        ? SortType.ASC
        : this.order === SortType.ASC
        ? SortType.DESC
        : SortType.NORMAL;
    void StockEagleEyeConfig.setConfig('stock-eagle-eye.stockSort', this.order);
    this.refresh();
    return this.order;
  }
}
