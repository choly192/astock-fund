import { commands, ExtensionContext, QuickPickItem, window } from 'vscode';
import { StockProvider } from './explorer/stockProvider';
import StockService from './explorer/stockService';
import {
  StockEagleEyeConfig,
  normalizeStockCode,
  parseStockCodeInput,
  removeStockGroupAt,
} from './shared/stockEagleEyeConfig';
import { StockTreeItem } from './shared/stockTreeItem';
import { SortType } from './shared/typed';
import { StatusBar } from './statusbar/statusBar';
import stockTrend from './webview/stockTrend';

type RefreshAll = () => Promise<void>;

function getGroupIndex(target?: StockTreeItem): number | undefined {
  return target?.info.groupIndex;
}

async function pickGroup(excludeIndex?: number): Promise<number | undefined> {
  const config = StockEagleEyeConfig.getStockGroupConfig();
  const choices = config.names
    .map((name, index) => ({ label: name, description: String(index), index }))
    .filter((item) => item.index !== excludeIndex);
  if (!choices.length) return undefined;
  if (choices.length === 1) return choices[0].index;
  const selected = await window.showQuickPick(choices, { placeHolder: '选择股票分组' });
  return selected?.index;
}

function normalizeSelectedCode(value: string): string {
  const raw = value.split(' | ')[0].trim();
  if (/^us/i.test(raw) && !/^usr_/i.test(raw)) {
    return normalizeStockCode(`usr_${raw.slice(2)}`);
  }
  return normalizeStockCode(raw);
}

function searchStock(service: StockService): Promise<string | undefined> {
  return new Promise((resolve) => {
    const picker = window.createQuickPick<QuickPickItem>();
    picker.placeholder = '输入股票代码或名称';
    picker.items = [{ label: '请输入股票代码或名称' }];
    let selectedCode: string | undefined;
    let timer: NodeJS.Timeout | undefined;
    let requestController: AbortController | undefined;
    let finished = false;

    const finish = (value?: string) => {
      if (finished) return;
      finished = true;
      if (timer) clearTimeout(timer);
      requestController?.abort();
      picker.dispose();
      resolve(value);
    };

    picker.onDidChangeValue((value) => {
      if (timer) clearTimeout(timer);
      requestController?.abort();
      selectedCode = undefined;
      picker.busy = true;
      timer = setTimeout(async () => {
        const controller = new AbortController();
        requestController = controller;
        const items = await service.getStockSuggestList(value, controller.signal);
        if (!controller.signal.aborted) {
          picker.items = items;
          picker.busy = false;
        }
      }, 150);
    });
    picker.onDidChangeSelection((selection) => {
      selectedCode = selection[0]?.label.includes(' | ')
        ? normalizeSelectedCode(selection[0].label)
        : undefined;
    });
    picker.onDidAccept(() => {
      if (selectedCode) finish(selectedCode);
    });
    picker.onDidHide(() => finish());
    picker.show();
  });
}

export function registerCommands(
  context: ExtensionContext,
  service: StockService,
  provider: StockProvider,
  statusBar: StatusBar,
  refreshAll: RefreshAll
): void {
  context.subscriptions.push(
    commands.registerCommand('stock-eagle-eye.refreshStock', refreshAll),
    commands.registerCommand('stock-eagle-eye.sortStock', () => {
      const order = provider.changeOrder();
      const label = order === SortType.ASC ? '涨跌幅升序' : order === SortType.DESC ? '涨跌幅降序' : '分组顺序';
      window.setStatusBarMessage(`股票排序：${label}`, 2000);
    }),
    commands.registerCommand('stock-eagle-eye.addStockGroup', async () => {
      const name = await window.showInputBox({
        prompt: '新建股票分组',
        placeHolder: '输入分组名称',
        validateInput: (value) => (value.trim() ? undefined : '分组名称不能为空'),
      });
      if (!name) return;
      try {
        await StockEagleEyeConfig.addStockGroup(name.trim());
        await refreshAll();
      } catch (error) {
        window.showErrorMessage(String(error instanceof Error ? error.message : error));
      }
    }),
    commands.registerCommand('stock-eagle-eye.renameStockGroup', async (target: StockTreeItem) => {
      const groupIndex = getGroupIndex(target);
      if (groupIndex === undefined) return;
      const config = StockEagleEyeConfig.getStockGroupConfig();
      const name = await window.showInputBox({
        prompt: '重命名股票分组',
        value: config.names[groupIndex],
        validateInput: (value) => (value.trim() ? undefined : '分组名称不能为空'),
      });
      if (!name || name.trim() === config.names[groupIndex]) return;
      try {
        await StockEagleEyeConfig.renameStockGroup(groupIndex, name.trim());
        provider.refresh();
      } catch (error) {
        window.showErrorMessage(String(error instanceof Error ? error.message : error));
      }
    }),
    commands.registerCommand('stock-eagle-eye.removeStockGroup', async (target: StockTreeItem) => {
      const groupIndex = getGroupIndex(target);
      if (groupIndex === undefined) return;
      const config = StockEagleEyeConfig.getStockGroupConfig();
      const destination = config.names.find((_name, index) => index !== groupIndex);
      const detail = destination
        ? `组内股票将移到“${destination}”。`
        : '组内股票将从自选列表中移除。';
      const answer = await window.showWarningMessage(
        `删除“${config.names[groupIndex]}”后，${detail}`,
        { modal: true },
        '删除分组'
      );
      if (answer !== '删除分组') return;
      const removed = removeStockGroupAt(config, groupIndex);
      const previousStatusCodes = StockEagleEyeConfig.getConfig<string[]>(
        'stock-eagle-eye.statusBarStock',
        []
      );
      await StockEagleEyeConfig.saveStockGroupConfig(removed);
      const remainingCodes = StockEagleEyeConfig.getAllStockCodes();
      await StockEagleEyeConfig.updateStatusBarStocks(
        previousStatusCodes.filter((code) => remainingCodes.includes(code))
      );
      await refreshAll();
      const undo = await window.showInformationMessage(`已删除股票分组“${config.names[groupIndex]}”`, '撤销');
      if (undo !== '撤销') return;
      if (JSON.stringify(StockEagleEyeConfig.getStockGroupConfig()) !== JSON.stringify(removed)) {
        window.showWarningMessage('分组已发生其他更改，无法撤销本次删除');
        return;
      }
      await StockEagleEyeConfig.saveStockGroupConfig(config);
      await StockEagleEyeConfig.updateStatusBarStocks(previousStatusCodes);
      await refreshAll();
    }),
    commands.registerCommand('stock-eagle-eye.addStock', async (target?: StockTreeItem) => {
      const groupIndex = getGroupIndex(target) ?? (await pickGroup());
      if (groupIndex === undefined) {
        window.showInformationMessage('请先创建股票分组');
        return;
      }
      const code = await searchStock(service);
      if (!code) return;
      await StockEagleEyeConfig.addStock(groupIndex, code);
      await refreshAll();
    }),
    commands.registerCommand('stock-eagle-eye.addStocks', async (target?: StockTreeItem) => {
      const groupIndex = getGroupIndex(target) ?? (await pickGroup());
      if (groupIndex === undefined) {
        window.showInformationMessage('请先创建股票分组');
        return;
      }
      const input = await window.showInputBox({
        prompt: '批量添加股票代码',
        placeHolder: '例如：600519, 000001, hk00700, NVDA',
      });
      if (!input) return;
      const parsed = parseStockCodeInput(input);
      if (!parsed.codes.length) {
        window.showErrorMessage('未识别到有效股票代码');
        return;
      }
      await StockEagleEyeConfig.addStocks(groupIndex, parsed.codes);
      await refreshAll();
      const suffix = parsed.invalid.length ? `，忽略 ${parsed.invalid.length} 个无效输入` : '';
      window.setStatusBarMessage(`已添加 ${parsed.codes.length} 只股票${suffix}`, 3000);
    }),
    commands.registerCommand('stock-eagle-eye.deleteStock', async (target: StockTreeItem) => {
      const groupIndex = getGroupIndex(target);
      if (groupIndex === undefined) return;
      await StockEagleEyeConfig.removeStock(groupIndex, target.info.code);
      const remainingCodes = StockEagleEyeConfig.getAllStockCodes();
      const statusCodes = StockEagleEyeConfig.getConfig<string[]>('stock-eagle-eye.statusBarStock', []);
      await StockEagleEyeConfig.updateStatusBarStocks(
        statusCodes.filter((code) => remainingCodes.includes(code))
      );
      await refreshAll();
    }),
    commands.registerCommand('stock-eagle-eye.moveStockToGroup', async (target: StockTreeItem) => {
      const groupIndex = getGroupIndex(target);
      if (groupIndex === undefined) return;
      const targetGroupIndex = await pickGroup(groupIndex);
      if (targetGroupIndex === undefined) {
        window.showInformationMessage('请先创建另一个股票分组');
        return;
      }
      await StockEagleEyeConfig.moveStock(targetGroupIndex, target.info.code);
      provider.refresh();
    }),
    commands.registerCommand('stock-eagle-eye.setStockTop', async (target: StockTreeItem) => {
      const groupIndex = getGroupIndex(target);
      if (groupIndex === undefined) return;
      await StockEagleEyeConfig.setStockTop(groupIndex, target.info.code);
      provider.refresh();
    }),
    commands.registerCommand('stock-eagle-eye.setStockUp', async (target: StockTreeItem) => {
      const groupIndex = getGroupIndex(target);
      if (groupIndex === undefined) return;
      await StockEagleEyeConfig.moveStockByOffset(groupIndex, target.info.code, -1);
      provider.refresh();
    }),
    commands.registerCommand('stock-eagle-eye.setStockDown', async (target: StockTreeItem) => {
      const groupIndex = getGroupIndex(target);
      if (groupIndex === undefined) return;
      await StockEagleEyeConfig.moveStockByOffset(groupIndex, target.info.code, 1);
      provider.refresh();
    }),
    commands.registerCommand('stock-eagle-eye.stockItemClick', (info) => {
      stockTrend(context, info);
    }),
    commands.registerCommand('stock-eagle-eye.stockTrend', (target: StockTreeItem) => {
      stockTrend(context, target.info);
    }),
    commands.registerCommand('stock-eagle-eye.addStockToBar', async (target: StockTreeItem) => {
      const codes = StockEagleEyeConfig.getConfig<string[]>('stock-eagle-eye.statusBarStock', []);
      if (codes.includes(target.info.code)) {
        window.showInformationMessage('该股票已在状态栏中');
        return;
      }
      if (codes.length >= 4) {
        window.showWarningMessage('状态栏最多显示 4 只股票');
        return;
      }
      await StockEagleEyeConfig.updateStatusBarStocks([...codes, target.info.code]);
      statusBar.refresh();
    }),
    commands.registerCommand('stock-eagle-eye.setStockStatusBar', async () => {
      if (!service.stockList.length) {
        window.showWarningMessage('暂无股票行情数据');
        return;
      }
      const current = StockEagleEyeConfig.getConfig<string[]>('stock-eagle-eye.statusBarStock', []);
      const items = service.stockList
        .filter((item) => item.info.type !== 'nodata')
        .map((item) => ({
          label: item.info.name,
          description: item.info.code,
          picked: current.includes(item.info.code),
        }));
      const selected = await window.showQuickPick(items, {
        canPickMany: true,
        placeHolder: '选择最多 4 只状态栏股票',
      });
      if (!selected) return;
      if (selected.length > 4) {
        window.showWarningMessage('状态栏最多显示 4 只股票');
        return;
      }
      await StockEagleEyeConfig.updateStatusBarStocks(
        selected.map((item) => item.description || '')
      );
      statusBar.refresh();
    }),
    commands.registerCommand('stock-eagle-eye.toggleStatusBarVisibility', () =>
      statusBar.toggleVisibility()
    ),
    commands.registerCommand('stock-eagle-eye.toggleStatusBarIconVisibility', () =>
      statusBar.toggleIconVisibility()
    ),
    commands.registerCommand('stock-eagle-eye.openConfigPage', () =>
      commands.executeCommand('workbench.action.openSettings', '@ext:stock-eagle-eye.stock-eagle-eye')
    )
  );
}
