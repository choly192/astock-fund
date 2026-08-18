import { commands, ExtensionContext, window, workspace } from 'vscode';
import { FundConfig } from './shared/fundConfig';
import { createPortfolioFile, parsePortfolioFile } from './shared/portfolioConfig';
import { StockEagleEyeConfig } from './shared/stockEagleEyeConfig';

type Refresh = () => Promise<void>;

export function registerPortfolioCommands(
  context: ExtensionContext,
  refreshStocks: Refresh,
  refreshFunds: Refresh
): void {
  context.subscriptions.push(
    commands.registerCommand('stock-eagle-eye.exportGroups', async () => {
      const uri = await window.showSaveDialog({
        filters: { JSON: ['json'] },
        saveLabel: '导出分组配置',
      });
      if (!uri) return;
      await workspace.fs.writeFile(uri, Buffer.from(createPortfolioFile(), 'utf8'));
      window.showInformationMessage('股票和基金分组配置已导出');
    }),
    commands.registerCommand('stock-eagle-eye.importGroups', async () => {
      const selected = await window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        filters: { JSON: ['json'] },
        openLabel: '导入分组配置',
      });
      if (!selected?.length) return;
      try {
        const content = await workspace.fs.readFile(selected[0]);
        const config = parsePortfolioFile(new TextDecoder().decode(content));
        const answer = await window.showWarningMessage(
          '导入将替换当前股票和基金分组，是否继续？',
          { modal: true },
          '继续导入'
        );
        if (answer !== '继续导入') return;
        await StockEagleEyeConfig.saveStockGroupConfig(config.stocks);
        await FundConfig.saveFundGroupConfig(config.funds);
        await Promise.all([refreshStocks(), refreshFunds()]);
        window.showInformationMessage('股票和基金分组配置已导入');
      } catch (error) {
        window.showErrorMessage(`导入失败：${error instanceof Error ? error.message : String(error)}`);
      }
    })
  );
}
