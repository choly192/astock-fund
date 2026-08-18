import { commands, ExtensionContext, QuickPickItem, window } from 'vscode';
import { FundProvider } from './explorer/fundProvider';
import FundService from './explorer/fundService';
import { FundConfig, parseFundCodeInput, removeFundGroupAt } from './shared/fundConfig';
import { FundTreeItem } from './shared/fundTreeItem';
import { SortType } from './shared/typed';
import fundTrend from './webview/fundTrend';

type RefreshFunds = () => Promise<void>;

function getGroupIndex(target?: FundTreeItem): number | undefined {
  return target?.info.groupIndex;
}

async function pickFundGroup(excludeIndex?: number): Promise<number | undefined> {
  const config = FundConfig.getFundGroupConfig();
  const choices = config.names
    .map((name, index) => ({ label: name, index }))
    .filter((item) => item.index !== excludeIndex);
  if (!choices.length) return undefined;
  if (choices.length === 1) return choices[0].index;
  const selected = await window.showQuickPick(choices, { placeHolder: '选择基金分组' });
  return selected?.index;
}

function searchFund(service: FundService): Promise<string | undefined> {
  return new Promise((resolve) => {
    const picker = window.createQuickPick<QuickPickItem>();
    picker.placeholder = '输入基金代码或名称';
    picker.items = [{ label: '请输入基金代码或名称' }];
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
        const items = await service.getFundSuggestList(value, controller.signal);
        if (!controller.signal.aborted) {
          picker.items = items;
          picker.busy = false;
        }
      }, 180);
    });
    picker.onDidChangeSelection((selection) => {
      const code = selection[0]?.label.split(' | ')[0].trim();
      selectedCode = /^\d{6}$/.test(code || '') ? code : undefined;
    });
    picker.onDidAccept(() => {
      if (selectedCode) finish(selectedCode);
    });
    picker.onDidHide(() => finish());
    picker.show();
  });
}

export function registerFundCommands(
  context: ExtensionContext,
  service: FundService,
  provider: FundProvider,
  refreshFunds: RefreshFunds
): void {
  context.subscriptions.push(
    commands.registerCommand('stock-eagle-eye.refreshFund', refreshFunds),
    commands.registerCommand('stock-eagle-eye.sortFund', () => {
      const order = provider.changeOrder();
      const label = order === SortType.ASC ? '日涨跌幅升序' : order === SortType.DESC ? '日涨跌幅降序' : '分组顺序';
      window.setStatusBarMessage(`基金排序：${label}`, 2000);
    }),
    commands.registerCommand('stock-eagle-eye.addFundGroup', async () => {
      const name = await window.showInputBox({
        prompt: '新建基金分组',
        placeHolder: '输入分组名称',
        validateInput: (value) => value.trim() ? undefined : '分组名称不能为空',
      });
      if (!name) return;
      try {
        await FundConfig.addFundGroup(name.trim());
        await refreshFunds();
      } catch (error) {
        window.showErrorMessage(String(error instanceof Error ? error.message : error));
      }
    }),
    commands.registerCommand('stock-eagle-eye.renameFundGroup', async (target: FundTreeItem) => {
      const groupIndex = getGroupIndex(target);
      if (groupIndex === undefined) return;
      const config = FundConfig.getFundGroupConfig();
      const name = await window.showInputBox({
        prompt: '重命名基金分组',
        value: config.names[groupIndex],
        validateInput: (value) => value.trim() ? undefined : '分组名称不能为空',
      });
      if (!name || name.trim() === config.names[groupIndex]) return;
      try {
        await FundConfig.renameFundGroup(groupIndex, name.trim());
        provider.refresh();
      } catch (error) {
        window.showErrorMessage(String(error instanceof Error ? error.message : error));
      }
    }),
    commands.registerCommand('stock-eagle-eye.removeFundGroup', async (target: FundTreeItem) => {
      const groupIndex = getGroupIndex(target);
      if (groupIndex === undefined) return;
      const config = FundConfig.getFundGroupConfig();
      const destination = config.names.find((_name, index) => index !== groupIndex);
      const detail = destination
        ? `组内基金将移到“${destination}”。`
        : '组内基金将从自选列表中移除。';
      const answer = await window.showWarningMessage(
        `删除“${config.names[groupIndex]}”后，${detail}`,
        { modal: true },
        '删除分组'
      );
      if (answer !== '删除分组') return;
      const removed = removeFundGroupAt(config, groupIndex);
      await FundConfig.saveFundGroupConfig(removed);
      await refreshFunds();
      const undo = await window.showInformationMessage(`已删除基金分组“${config.names[groupIndex]}”`, '撤销');
      if (undo !== '撤销') return;
      if (JSON.stringify(FundConfig.getFundGroupConfig()) !== JSON.stringify(removed)) {
        window.showWarningMessage('分组已发生其他更改，无法撤销本次删除');
        return;
      }
      await FundConfig.saveFundGroupConfig(config);
      await refreshFunds();
    }),
    commands.registerCommand('stock-eagle-eye.addFund', async (target?: FundTreeItem) => {
      const groupIndex = getGroupIndex(target) ?? await pickFundGroup();
      if (groupIndex === undefined) {
        window.showInformationMessage('请先创建基金分组');
        return;
      }
      const code = await searchFund(service);
      if (!code) return;
      await FundConfig.addFund(groupIndex, code);
      await refreshFunds();
    }),
    commands.registerCommand('stock-eagle-eye.addFunds', async (target?: FundTreeItem) => {
      const groupIndex = getGroupIndex(target) ?? await pickFundGroup();
      if (groupIndex === undefined) {
        window.showInformationMessage('请先创建基金分组');
        return;
      }
      const input = await window.showInputBox({
        prompt: '批量添加基金代码',
        placeHolder: '例如：110022, 000001, 161725',
      });
      if (!input) return;
      const parsed = parseFundCodeInput(input);
      if (!parsed.codes.length) {
        window.showErrorMessage('未识别到有效基金代码');
        return;
      }
      await FundConfig.addFunds(groupIndex, parsed.codes);
      await refreshFunds();
      const suffix = parsed.invalid.length ? `，忽略 ${parsed.invalid.length} 个无效输入` : '';
      window.setStatusBarMessage(`已添加 ${parsed.codes.length} 只基金${suffix}`, 3000);
    }),
    commands.registerCommand('stock-eagle-eye.deleteFund', async (target: FundTreeItem) => {
      const groupIndex = getGroupIndex(target);
      if (groupIndex === undefined) return;
      await FundConfig.removeFund(groupIndex, target.info.code);
      await refreshFunds();
    }),
    commands.registerCommand('stock-eagle-eye.moveFundToGroup', async (target: FundTreeItem) => {
      const groupIndex = getGroupIndex(target);
      if (groupIndex === undefined) return;
      const targetGroupIndex = await pickFundGroup(groupIndex);
      if (targetGroupIndex === undefined) {
        window.showInformationMessage('请先创建另一个基金分组');
        return;
      }
      await FundConfig.moveFund(targetGroupIndex, target.info.code);
      provider.refresh();
    }),
    commands.registerCommand('stock-eagle-eye.setFundTop', async (target: FundTreeItem) => {
      const groupIndex = getGroupIndex(target);
      if (groupIndex === undefined) return;
      await FundConfig.setFundTop(groupIndex, target.info.code);
      provider.refresh();
    }),
    commands.registerCommand('stock-eagle-eye.setFundUp', async (target: FundTreeItem) => {
      const groupIndex = getGroupIndex(target);
      if (groupIndex === undefined) return;
      await FundConfig.moveFundByOffset(groupIndex, target.info.code, -1);
      provider.refresh();
    }),
    commands.registerCommand('stock-eagle-eye.setFundDown', async (target: FundTreeItem) => {
      const groupIndex = getGroupIndex(target);
      if (groupIndex === undefined) return;
      await FundConfig.moveFundByOffset(groupIndex, target.info.code, 1);
      provider.refresh();
    }),
    commands.registerCommand('stock-eagle-eye.fundItemClick', (info) => fundTrend(service, info)),
    commands.registerCommand('stock-eagle-eye.fundTrend', (target: FundTreeItem) =>
      fundTrend(service, target.info)
    )
  );
}
