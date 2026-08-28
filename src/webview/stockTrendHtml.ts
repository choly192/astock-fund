import { EastMoneyStockTarget, getEastMoneyStockTarget } from '../shared/eastMoneyStock';
import { StockInfo } from '../shared/typed';
import { escapeHtml } from '../shared/utils';

export { EastMoneyStockTarget, getEastMoneyStockTarget };

function display(value: string | number | undefined): string {
  return value === undefined || value === '' ? '--' : escapeHtml(String(value));
}

export function getStockTrendHtml(
  info: StockInfo,
  scriptUri: string,
  cspSource: string
): string {
  const target = getEastMoneyStockTarget(info.code);
  const title = `${escapeHtml(info.name)} (${escapeHtml(info.code.toUpperCase())})`;
  const percentValue = Number(info.percent);
  const percent = Number.isFinite(percentValue)
    ? `${percentValue >= 0 ? '+' : ''}${percentValue.toFixed(2)}%`
    : '--';
  const trendClass = Number.isFinite(percentValue)
    ? percentValue > 0 ? 'rise' : percentValue < 0 ? 'fall' : ''
    : '';
  const safeUrl = escapeHtml(target.url);
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src ${escapeHtml(cspSource)};">
  <title>${title}</title>
  <style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    html, body { width: 100%; height: 100%; margin: 0; background: #0b0d10; }
    body { min-width: 300px; overflow: hidden; color: #d5d7dc; font-family: var(--vscode-font-family, "Microsoft YaHei", sans-serif); letter-spacing: 0; }
    button { font: inherit; letter-spacing: 0; }
    .page { display: grid; width: 100%; height: 100%; grid-template-rows: auto 43px minmax(0, 1fr); }
    .quote { display: grid; grid-template-columns: minmax(230px, 1fr) minmax(390px, 1.4fr) auto; gap: 24px; align-items: center; min-height: 92px; padding: 14px 18px; border-bottom: 1px solid #24272d; background: #101216; }
    .identity { min-width: 0; }
    h1 { margin: 0 0 3px; overflow: hidden; color: #f0f1f3; font-size: 18px; line-height: 1.35; text-overflow: ellipsis; white-space: nowrap; }
    .meta { color: #737983; font: 11px var(--vscode-editor-font-family, Consolas, monospace); }
    .headline { display: flex; align-items: baseline; gap: 12px; margin-top: 8px; }
    .price { font: 26px/1 var(--vscode-editor-font-family, Consolas, monospace); font-weight: 650; }
    .percent { font: 13px var(--vscode-editor-font-family, Consolas, monospace); font-weight: 600; }
    .rise { color: #ee4b5a; } .fall { color: #16a36d; }
    .stats { display: grid; grid-template-columns: repeat(4, minmax(70px, 1fr)); gap: 10px 18px; margin: 0; }
    .stats div { display: flex; min-width: 0; justify-content: space-between; gap: 8px; }
    .stats dt { color: #6f747d; font-size: 11px; }
    .stats dd { margin: 0; overflow: hidden; color: #c8cbd0; font: 11px var(--vscode-editor-font-family, Consolas, monospace); text-overflow: ellipsis; white-space: nowrap; }
    .external { align-self: start; color: #9ca1aa; font-size: 12px; text-decoration: none; white-space: nowrap; }
    .external:hover { color: #fff; text-decoration: underline; }
    .periods { display: flex; align-items: stretch; min-width: 0; padding: 0 10px; overflow-x: auto; border-bottom: 1px solid #24272d; background: #101216; scrollbar-width: none; }
    .periods::-webkit-scrollbar { display: none; }
    .period-tab { position: relative; flex: 0 0 auto; min-width: 58px; padding: 0 11px; border: 0; color: #898e97; background: transparent; cursor: pointer; }
    .period-tab:hover, .period-tab.active { color: #f1f2f4; }
    .period-tab:focus-visible { outline: 1px solid #ee4b5a; outline-offset: -3px; }
    .period-tab.active::after { position: absolute; right: 12px; bottom: 0; left: 12px; height: 2px; background: #ee4b5a; content: ""; }
    .chart-wrap { position: relative; min-height: 0; background: #0b0d10; }
    .chart { position: absolute; inset: 0; }
    .loading { position: absolute; inset: 0; z-index: 4; display: grid; place-items: center; color: #777d87; background: #0b0d10; font-size: 12px; }
    .loading[hidden] { display: none; }
    .loading.error { color: #d58a8f; }
    .legend { position: absolute; top: 9px; left: 12px; z-index: 3; min-height: 18px; color: #aeb2b9; font: 11px var(--vscode-editor-font-family, Consolas, monospace); pointer-events: none; }
    .latest-point { position: absolute; z-index: 2; display: none; width: 7px; height: 7px; border: 1px solid #0b0d10; border-radius: 50%; background: #e5e8ed; box-shadow: 0 0 0 2px rgba(229, 232, 237, .18); pointer-events: none; transform: translate(-50%, -50%); }
    .latest-point.visible { display: block; }
    .latest-point.visible.live { animation: latest-point-pulse 1.25s ease-out infinite; }
    @keyframes latest-point-pulse {
      0%, 100% { opacity: 1; box-shadow: 0 0 0 1px rgba(229, 232, 237, .42); }
      55% { opacity: .48; box-shadow: 0 0 0 6px rgba(229, 232, 237, 0); }
    }
    @media (prefers-reduced-motion: reduce) { .latest-point.visible.live { animation: none; } }
    @media (max-width: 760px) {
      .quote { grid-template-columns: 1fr auto; gap: 14px; min-height: 84px; padding: 12px 14px; }
      .stats { display: none; }
      .price { font-size: 22px; }
      .external { grid-column: 2; grid-row: 1; }
    }
  </style>
</head>
<body>
  <main class="page">
    <header class="quote">
      <section class="identity">
        <h1>${escapeHtml(info.name)}</h1>
        <div class="meta">${escapeHtml(info.code.toUpperCase())} · ${display(info.source)} · <span class="quote-time">${display(info.time)}</span></div>
        <div class="headline ${trendClass}"><span class="price">${display(info.price)}</span><span class="percent">${percent}</span></div>
      </section>
      <dl class="stats">
        <div><dt>今开</dt><dd data-stat="open">${display(info.open)}</dd></div>
        <div><dt>最高</dt><dd data-stat="high">${display(info.high)}</dd></div>
        <div><dt>最低</dt><dd data-stat="low">${display(info.low)}</dd></div>
        <div><dt>昨收</dt><dd>${display(info.yestclose)}</dd></div>
        <div><dt>涨跌</dt><dd data-stat="change">${display(info.updown)}</dd></div>
        <div><dt>成交量</dt><dd data-stat="volume">${display(info.volume)}</dd></div>
        <div><dt>成交额</dt><dd>${display(info.amount)}</dd></div>
      </dl>
      <a class="external" href="${safeUrl}" title="在系统浏览器中打开东方财富行情">浏览器打开</a>
    </header>
    <nav class="periods" role="tablist" aria-label="行情周期">
      <button class="period-tab active" role="tab" aria-selected="true" data-period="trend">分时</button>
      <button class="period-tab" role="tab" aria-selected="false" data-period="day">日 K</button>
      <button class="period-tab" role="tab" aria-selected="false" data-period="week">周 K</button>
      <button class="period-tab" role="tab" aria-selected="false" data-period="month">月 K</button>
      <button class="period-tab" role="tab" aria-selected="false" data-period="5m">5 分</button>
      <button class="period-tab" role="tab" aria-selected="false" data-period="15m">15 分</button>
      <button class="period-tab" role="tab" aria-selected="false" data-period="30m">30 分</button>
      <button class="period-tab" role="tab" aria-selected="false" data-period="60m">60 分</button>
    </nav>
    <section class="chart-wrap">
      <div class="legend" aria-live="polite"></div>
      <div class="chart" aria-label="股票分时和 K 线图"></div>
      <div class="latest-point" aria-hidden="true"></div>
      <div class="loading">正在加载行情...</div>
    </section>
  </main>
  <script src="${escapeHtml(scriptUri)}"></script>
</body>
</html>`;
}
