import { Disposable, ExtensionContext, Uri, ViewColumn } from 'vscode';
import { StockTrendService } from '../explorer/stockTrendService';
import { StockChartPeriod, StockChartRequestMessage, StockChartResponseMessage } from '../shared/stockChartProtocol';
import { StockInfo } from '../shared/typed';
import { createReusedWebviewPanel } from './ReusedWebviewPanel';
import { getStockTrendHtml } from './stockTrendHtml';

const service = new StockTrendService();
const periods = new Set<StockChartPeriod>([
  'trend', 'day', 'week', 'month', '5m', '15m', '30m', '60m',
]);
let messageListener: Disposable | undefined;
let generation = 0;

export default function stockTrend(context: ExtensionContext, info: StockInfo): void {
  generation += 1;
  const currentGeneration = generation;
  const distUri = Uri.joinPath(context.extensionUri, 'dist');
  const panel = createReusedWebviewPanel(
    'stockTrendWebview',
    `股票行情 (${info.code})`,
    ViewColumn.One,
    { enableScripts: true, localResourceRoots: [distUri] }
  );
  const scriptUri = panel.webview.asWebviewUri(Uri.joinPath(distUri, 'stockChart.js')).toString();

  messageListener?.dispose();
  messageListener = panel.webview.onDidReceiveMessage(async (message: StockChartRequestMessage) => {
    if (message?.type !== 'loadPeriod' || !periods.has(message.period)) return;
    try {
      const data = await service.getData(info.code, message.period);
      if (currentGeneration !== generation) return;
      const response: StockChartResponseMessage = {
        type: 'chartData',
        period: message.period,
        data,
      };
      await panel.webview.postMessage(response);
    } catch (error) {
      if (currentGeneration !== generation) return;
      console.error('Stock chart request failed', error);
      const response: StockChartResponseMessage = {
        type: 'chartError',
        period: message.period,
        message: '该周期行情暂时无法加载，请稍后重试',
      };
      await panel.webview.postMessage(response);
    }
  });
  panel.onDidDispose(() => {
    if (currentGeneration !== generation) return;
    messageListener?.dispose();
    messageListener = undefined;
  });
  panel.webview.html = getStockTrendHtml(info, scriptUri, panel.webview.cspSource);
}
