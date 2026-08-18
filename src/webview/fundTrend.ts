import { ViewColumn, window } from 'vscode';
import FundService from '../explorer/fundService';
import { FundInfo } from '../shared/typed';
import { createReusedWebviewPanel } from './ReusedWebviewPanel';
import { getFundTrendHtml } from './fundTrendHtml';

export default async function fundTrend(service: FundService, info: FundInfo): Promise<void> {
  const panel = createReusedWebviewPanel(
    'fundTrendWebview',
    `基金走势 (${info.code})`,
    ViewColumn.One,
    { enableScripts: true }
  );
  panel.webview.html = '<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\';"></head><body style="color:#999;background:#0b0d10;font-family:sans-serif;padding:24px">正在加载基金历史净值...</body></html>';
  try {
    const history = await service.getFundHistory(info.code);
    panel.webview.html = getFundTrendHtml(info, history);
  } catch (error) {
    console.error(error);
    panel.dispose();
    window.showErrorMessage('基金历史净值加载失败，请检查网络后重试');
  }
}
