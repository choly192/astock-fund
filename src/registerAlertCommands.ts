import { commands, ExtensionContext, window } from 'vscode';
import {
  describeStockAlert,
  StockAlertCondition,
  StockAlertManager,
} from './alerts/stockAlertManager';
import { StockTreeItem } from './shared/stockTreeItem';

export function registerAlertCommands(
  context: ExtensionContext,
  manager: StockAlertManager
): void {
  context.subscriptions.push(
    commands.registerCommand('stock-eagle-eye.setStockAlert', async (target: StockTreeItem) => {
      if (!target?.info || target.info.type === 'nodata') return;
      const choices: Array<{ label: string; description: string; condition: StockAlertCondition }> = [
        { label: '价格达到', description: '当前价格大于或等于目标值', condition: 'priceAbove' },
        { label: '价格跌到', description: '当前价格小于或等于目标值', condition: 'priceBelow' },
        { label: '涨跌幅达到', description: '涨跌幅大于或等于目标百分比', condition: 'percentAbove' },
        { label: '涨跌幅跌到', description: '涨跌幅小于或等于目标百分比', condition: 'percentBelow' },
      ];
      const selected = await window.showQuickPick(choices, {
        placeHolder: `设置 ${target.info.name} 的本地提醒`,
      });
      if (!selected) return;
      const currentValue = selected.condition.startsWith('percent')
        ? target.info.percent
        : target.info.price;
      const input = await window.showInputBox({
        prompt: selected.condition.startsWith('percent') ? '输入目标涨跌幅（%）' : '输入目标价格',
        value: String(currentValue || ''),
        validateInput: (value) => {
          const numeric = Number(value);
          if (!Number.isFinite(numeric)) return '请输入有效数字';
          if (!selected.condition.startsWith('percent') && numeric <= 0) return '价格必须大于 0';
          return undefined;
        },
      });
      if (input === undefined) return;
      await manager.setRule(target.info, selected.condition, Number(input));
      window.setStatusBarMessage(`${target.info.name} 提醒已设置`, 2500);
    }),
    commands.registerCommand('stock-eagle-eye.manageStockAlerts', async () => {
      const rules = manager.getRules();
      if (!rules.length) {
        window.showInformationMessage('暂无股票提醒，请在股票右键菜单中设置');
        return;
      }
      const selected = await window.showQuickPick(
        rules.map((rule) => ({
          label: `${rule.enabled ? '$(bell)' : '$(bell-slash)'} ${rule.name}`,
          description: `${rule.code.toUpperCase()} · ${describeStockAlert(rule)}`,
          detail: rule.lastTriggeredAt
            ? `上次触发：${new Date(rule.lastTriggeredAt).toLocaleString('zh-CN')}`
            : '尚未触发',
          rule,
        })),
        { placeHolder: '选择要管理的股票提醒' }
      );
      if (!selected) return;
      const action = await window.showQuickPick([
        { label: selected.rule.enabled ? '暂停提醒' : '启用提醒', action: 'toggle' },
        { label: '删除提醒', action: 'delete' },
      ], { placeHolder: selected.description });
      if (!action) return;
      if (action.action === 'toggle') await manager.toggle(selected.rule.id);
      else await manager.remove(selected.rule.id);
      window.setStatusBarMessage('股票提醒已更新', 2000);
    })
  );
}
