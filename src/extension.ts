import { ExtensionContext, TreeView, window, workspace } from 'vscode';
import { StockProvider } from './explorer/stockProvider';
import StockService from './explorer/stockService';
import { FundProvider } from './explorer/fundProvider';
import FundService from './explorer/fundService';
import { registerCommands } from './registerCommand';
import { registerFundCommands } from './registerFundCommands';
import { registerPortfolioCommands } from './registerPortfolioCommands';
import { registerAlertCommands } from './registerAlertCommands';
import { StockAlertManager } from './alerts/stockAlertManager';
import { FundConfig } from './shared/fundConfig';
import { FundTreeItem } from './shared/fundTreeItem';
import { StockEagleEyeConfig } from './shared/stockEagleEyeConfig';
import { StockTreeItem } from './shared/stockTreeItem';
import { RefreshQueue } from './shared/refreshQueue';
import { isAnyStockMarketOpen } from './shared/utils';
import { StatusBar } from './statusbar/statusBar';

let pollTimer: NodeJS.Timeout | undefined;
let stockTreeView: TreeView<StockTreeItem> | undefined;
let fundTreeView: TreeView<FundTreeItem> | undefined;
let statusBar: StatusBar | undefined;

export async function activate(context: ExtensionContext): Promise<void> {
  const service = new StockService(context);
  const provider = new StockProvider(service, context);
  const fundService = new FundService(context);
  const fundProvider = new FundProvider(fundService, context);
  const alertManager = new StockAlertManager(context);
  statusBar = new StatusBar(service);
  context.subscriptions.push(statusBar, alertManager);

  const stockRefreshQueue = new RefreshQueue(async () => {
    await service.getData(StockEagleEyeConfig.getAllStockCodes());
    provider.refresh();
  });
  const refreshAll = () => stockRefreshQueue.run();

  const fundRefreshQueue = new RefreshQueue(async () => {
    await fundService.getData(FundConfig.getAllFundCodes());
    fundProvider.refresh();
  });
  const refreshFunds = () => fundRefreshQueue.run();
  registerCommands(context, service, provider, statusBar, refreshAll);
  registerFundCommands(context, fundService, fundProvider, refreshFunds);
  registerPortfolioCommands(context, refreshAll, refreshFunds);
  registerAlertCommands(context, alertManager);

  try {
    await Promise.all([
      StockEagleEyeConfig.migrateStockGroups(),
      FundConfig.migrateFundGroups(),
    ]);
  } catch (error) {
    console.error('Configuration migration failed', error);
    window.showWarningMessage('部分旧配置迁移失败，扩展将继续使用当前配置');
  }

  try {
    stockTreeView = window.createTreeView('stockEagleEyeView.stock', {
      treeDataProvider: provider,
      showCollapseAll: true,
    });
    fundTreeView = window.createTreeView('stockEagleEyeView.fund', {
      treeDataProvider: fundProvider,
      showCollapseAll: true,
    });
    context.subscriptions.push(
      stockTreeView,
      fundTreeView,
      fundTreeView.onDidChangeVisibility((event) => {
        if (event.visible) void refreshFunds();
      })
    );
  } catch (error) {
    console.error('Tree view initialization failed', error);
    window.showErrorMessage('行情侧栏初始化失败，请执行“Developer: Reload Window”后重试');
  }

  const resetPollTimer = () => {
    if (pollTimer) clearInterval(pollTimer);
    const configured = StockEagleEyeConfig.getConfig<number>('stock-eagle-eye.interval', 5000);
    const interval = Math.max(3000, configured || 5000);
    pollTimer = setInterval(() => {
      const codes = StockEagleEyeConfig.getAllStockCodes();
      if (isAnyStockMarketOpen(codes)) void refreshAll();
    }, interval);
  };

  resetPollTimer();
  void refreshAll();
  void refreshFunds();

  context.subscriptions.push(
    workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('stock-eagle-eye.interval')) resetPollTimer();

      if (event.affectsConfiguration('stock-eagle-eye.stocks')) {
        void refreshAll();
      } else if (event.affectsConfiguration('stock-eagle-eye.stockGroups')) {
        provider.refresh();
      }

      if (event.affectsConfiguration('stock-eagle-eye.funds')) {
        void refreshFunds();
      } else if (event.affectsConfiguration('stock-eagle-eye.fundGroups')) {
        fundProvider.refresh();
      }

      if (event.affectsConfiguration('stock-eagle-eye.labelFormat')) provider.refresh();
      if (
        event.affectsConfiguration('stock-eagle-eye.statusBarStock') ||
        event.affectsConfiguration('stock-eagle-eye.labelFormat') ||
        event.affectsConfiguration('stock-eagle-eye.riseColor') ||
        event.affectsConfiguration('stock-eagle-eye.fallColor') ||
        event.affectsConfiguration('stock-eagle-eye.hideStatusBar') ||
        event.affectsConfiguration('stock-eagle-eye.hideStatusBarIcon')
      ) {
        statusBar?.refresh();
      }
    })
  );
}

export function deactivate(): void {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = undefined;
  statusBar?.dispose();
  statusBar = undefined;
  stockTreeView = undefined;
  fundTreeView = undefined;
}
