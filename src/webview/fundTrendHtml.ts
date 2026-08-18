import { randomBytes } from 'crypto';
import { FundHistory, FundInfo } from '../shared/typed';
import { escapeHtml } from '../shared/utils';

function scriptValue(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

function display(value: string | undefined): string {
  return value ? escapeHtml(value) : '--';
}

function signedPercent(value: string | undefined): string {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? `${numeric > 0 ? '+' : ''}${numeric.toFixed(2)}%` : '--';
}

export function getFundTrendHtml(info: FundInfo, history: FundHistory): string {
  const nonce = randomBytes(16).toString('base64');
  const latest = history.netWorthTrend[history.netWorthTrend.length - 1];
  const percent = Number(info.percent);
  const trendClass = Number.isFinite(percent) ? percent > 0 ? 'rise' : percent < 0 ? 'fall' : '' : '';
  const payload = {
    netWorth: history.netWorthTrend.map((item) => [item.timestamp, item.value]),
    cumulative: history.cumulativeReturnTrend.map((item) => [item.timestamp, item.value]),
  };
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <title>${escapeHtml(history.name)} 净值走势</title>
  <style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    body { margin: 0; min-width: 300px; color: #d5d7dc; background: #0b0d10; font-family: var(--vscode-font-family, "Microsoft YaHei", sans-serif); letter-spacing: 0; }
    button { font: inherit; letter-spacing: 0; }
    .page { width: min(1180px, 100%); margin: 0 auto; }
    .header { display: grid; grid-template-columns: minmax(220px, 1fr) minmax(420px, 2fr); gap: 30px; align-items: end; padding: 22px 24px 18px; border-bottom: 1px solid #24272d; background: #101216; }
    h1 { margin: 0 0 5px; color: #f0f1f3; font-size: 20px; line-height: 1.35; }
    .meta { color: #777d87; font: 12px var(--vscode-editor-font-family, Consolas, monospace); }
    .headline { display: flex; align-items: baseline; gap: 13px; margin-top: 14px; }
    .value { font-size: 29px; font-weight: 650; }
    .percent { font-size: 14px; font-weight: 600; }
    .rise { color: #f0525f; } .fall { color: #20ad76; }
    .stats { display: grid; grid-template-columns: repeat(4, minmax(90px, 1fr)); gap: 18px; margin: 0; }
    .stats div { min-width: 0; }
    .stats dt { margin-bottom: 6px; color: #727780; font-size: 12px; }
    .stats dd { margin: 0; color: #d0d2d7; font: 13px var(--vscode-editor-font-family, Consolas, monospace); }
    .toolbar { display: flex; min-height: 46px; padding: 0 16px; overflow-x: auto; border-bottom: 1px solid #24272d; background: #101216; }
    .toolbar .spacer { flex: 1; min-width: 18px; }
    .tab { position: relative; flex: 0 0 auto; min-width: 60px; height: 45px; padding: 0 12px; border: 0; color: #8d929b; background: transparent; cursor: pointer; }
    .tab:hover, .tab.active { color: #f1f2f4; }
    .tab.active::after { position: absolute; right: 13px; bottom: 0; left: 13px; height: 2px; background: #e24b57; content: ""; }
    .chart-wrap { position: relative; height: min(66vh, 650px); min-height: 390px; padding: 22px 18px 10px; background: #0b0d10; }
    canvas { display: block; width: 100%; height: 100%; outline: 0; touch-action: pan-y; }
    canvas:focus-visible { box-shadow: inset 0 0 0 1px #4d515a; }
    .tooltip { position: absolute; display: none; min-width: 142px; padding: 8px 10px; border: 1px solid #363a42; color: #d9dbe0; background: rgba(17, 19, 23, .96); font: 12px/1.6 var(--vscode-editor-font-family, Consolas, monospace); white-space: pre-line; pointer-events: none; }
    .source { padding: 0 20px 14px; color: #5f646d; font-size: 11px; text-align: right; }
    @media (max-width: 760px) { .header { grid-template-columns: 1fr; gap: 20px; padding: 18px 16px; } .stats { grid-template-columns: repeat(2, minmax(90px, 1fr)); } .chart-wrap { min-height: 330px; padding: 16px 8px 8px; } }
  </style>
</head>
<body>
  <main class="page">
    <header class="header">
      <section>
        <h1>${escapeHtml(history.name)}</h1>
        <div class="meta">${escapeHtml(history.code)} · ${display(info.fundType)} · ${display(info.date)}</div>
        <div class="headline ${trendClass}"><span class="value">${display(info.netValue || String(latest.value))}</span><span class="percent">${signedPercent(info.percent)}</span></div>
      </section>
      <dl class="stats">
        <div><dt>近 1 月</dt><dd>${signedPercent(history.returns.oneMonth)}</dd></div>
        <div><dt>近 3 月</dt><dd>${signedPercent(history.returns.threeMonths)}</dd></div>
        <div><dt>近 6 月</dt><dd>${signedPercent(history.returns.sixMonths)}</dd></div>
        <div><dt>近 1 年</dt><dd>${signedPercent(history.returns.oneYear)}</dd></div>
      </dl>
    </header>
    <nav class="toolbar" role="tablist" aria-label="净值走势选项">
      <button class="tab series active" role="tab" aria-selected="true" data-series="netWorth">单位净值</button>
      <button class="tab series" role="tab" aria-selected="false" data-series="cumulative">累计收益</button>
      <span class="spacer"></span>
      <button class="tab range" role="tab" aria-selected="false" data-range="1">1 月</button>
      <button class="tab range" role="tab" aria-selected="false" data-range="3">3 月</button>
      <button class="tab range" role="tab" aria-selected="false" data-range="6">6 月</button>
      <button class="tab range active" role="tab" aria-selected="true" data-range="12">1 年</button>
      <button class="tab range" role="tab" aria-selected="false" data-range="0">全部</button>
    </nav>
    <section class="chart-wrap"><canvas tabindex="0" role="img" aria-label="基金净值趋势图，可使用左右方向键浏览数据点"></canvas><div class="tooltip" role="status" aria-live="polite"></div></section>
    <footer class="source">数据来源：东方财富 · 显示最新公布净值，不代表盘中实时估值</footer>
  </main>
  <script nonce="${nonce}">
    (() => {
      const series = ${scriptValue(payload)};
      const canvas = document.querySelector('canvas');
      const tooltip = document.querySelector('.tooltip');
      const wrap = document.querySelector('.chart-wrap');
      const context = canvas.getContext('2d');
      let seriesName = 'netWorth';
      let months = 12;
      let visible = [];
      let points = [];
      let activePointIndex = -1;

      const formatDate = (time) => new Date(time).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
      const currentData = () => {
        const source = series[seriesName] && series[seriesName].length ? series[seriesName] : series.netWorth;
        if (!months || !source.length) return source;
        const end = source[source.length - 1][0];
        const cutoff = new Date(end);
        cutoff.setMonth(cutoff.getMonth() - months);
        return source.filter((item) => item[0] >= cutoff.getTime());
      };
      const draw = () => {
        const ratio = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        canvas.width = Math.max(1, Math.floor(rect.width * ratio));
        canvas.height = Math.max(1, Math.floor(rect.height * ratio));
        context.setTransform(ratio, 0, 0, ratio, 0, 0);
        const width = rect.width;
        const height = rect.height;
        const padding = { left: 58, right: 18, top: 16, bottom: 34 };
        visible = currentData();
        if (!visible.length) return;
        const values = visible.map((item) => item[1]);
        let min = Math.min(...values);
        let max = Math.max(...values);
        if (min === max) { min -= 1; max += 1; }
        const gap = (max - min) * .08;
        min -= gap; max += gap;
        const plotWidth = width - padding.left - padding.right;
        const plotHeight = height - padding.top - padding.bottom;
        const firstTime = visible[0][0];
        const lastTime = visible[visible.length - 1][0];
        const xFor = (time) => padding.left + ((time - firstTime) / Math.max(1, lastTime - firstTime)) * plotWidth;
        const yFor = (value) => padding.top + (1 - (value - min) / (max - min)) * plotHeight;
        context.clearRect(0, 0, width, height);
        context.font = '11px Consolas, monospace';
        context.textBaseline = 'middle';
        for (let index = 0; index <= 4; index += 1) {
          const y = padding.top + (plotHeight / 4) * index;
          const value = max - ((max - min) / 4) * index;
          context.strokeStyle = '#23262c';
          context.lineWidth = 1;
          context.beginPath(); context.moveTo(padding.left, y); context.lineTo(width - padding.right, y); context.stroke();
          context.fillStyle = '#686e77';
          context.textAlign = 'right';
          context.fillText(value.toFixed(seriesName === 'netWorth' ? 4 : 2), padding.left - 8, y);
        }
        context.textBaseline = 'top';
        for (let index = 0; index <= 4; index += 1) {
          const time = firstTime + ((lastTime - firstTime) / 4) * index;
          context.fillStyle = '#686e77';
          context.textAlign = index === 0 ? 'left' : index === 4 ? 'right' : 'center';
          context.fillText(formatDate(time).slice(0, -3), padding.left + (plotWidth / 4) * index, height - 24);
        }
        points = visible.map((item) => ({ x: xFor(item[0]), y: yFor(item[1]), item }));
        const step = Math.max(1, Math.ceil(points.length / Math.max(1, Math.floor(plotWidth))));
        const reduced = points.filter((_point, index) => index % step === 0 || index === points.length - 1);
        context.beginPath();
        reduced.forEach((point, index) => index ? context.lineTo(point.x, point.y) : context.moveTo(point.x, point.y));
        context.strokeStyle = seriesName === 'netWorth' ? '#e34d59' : '#d7a93b';
        context.lineWidth = 1.6;
        context.stroke();
      };
      const setActiveTab = (selector, active) => {
        document.querySelectorAll(selector).forEach((item) => {
          const selected = item === active;
          item.classList.toggle('active', selected);
          item.setAttribute('aria-selected', String(selected));
        });
      };
      const hideTooltip = () => {
        activePointIndex = -1;
        tooltip.style.display = 'none';
      };
      const showPoint = (index) => {
        if (!points.length) return;
        activePointIndex = Math.max(0, Math.min(points.length - 1, index));
        const point = points[activePointIndex];
        const label = seriesName === 'netWorth' ? '单位净值 ' : '累计收益 ';
        const suffix = seriesName === 'netWorth' ? '' : '%';
        const detail = formatDate(point.item[0]) + '\n' + label + point.item[1].toFixed(seriesName === 'netWorth' ? 4 : 2) + suffix;
        tooltip.style.display = 'block';
        tooltip.style.left = Math.min(wrap.clientWidth - 160, Math.max(8, point.x + 14)) + 'px';
        tooltip.style.top = Math.max(8, point.y - 48) + 'px';
        tooltip.textContent = detail;
        canvas.setAttribute('aria-label', '基金净值趋势图，' + detail.replace('\n', '，'));
      };
      const showNearestPoint = (clientX) => {
        if (!points.length) return;
        const x = clientX - canvas.getBoundingClientRect().left;
        let nearestIndex = 0;
        points.forEach((point, index) => {
          if (Math.abs(point.x - x) < Math.abs(points[nearestIndex].x - x)) nearestIndex = index;
        });
        showPoint(nearestIndex);
      };
      document.querySelectorAll('.series').forEach((tab) => tab.addEventListener('click', () => {
        seriesName = tab.dataset.series;
        setActiveTab('.series', tab);
        hideTooltip();
        draw();
      }));
      document.querySelectorAll('.range').forEach((tab) => tab.addEventListener('click', () => {
        months = Number(tab.dataset.range);
        setActiveTab('.range', tab);
        hideTooltip();
        draw();
      }));
      canvas.addEventListener('pointermove', (event) => showNearestPoint(event.clientX));
      canvas.addEventListener('pointerdown', (event) => {
        showNearestPoint(event.clientX);
        canvas.focus({ preventScroll: true });
      });
      canvas.addEventListener('pointerleave', (event) => {
        if (event.pointerType === 'mouse') hideTooltip();
      });
      canvas.addEventListener('keydown', (event) => {
        if (!points.length || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        if (event.key === 'Home') activePointIndex = 0;
        else if (event.key === 'End') activePointIndex = points.length - 1;
        else if (activePointIndex < 0) activePointIndex = points.length - 1;
        else activePointIndex += event.key === 'ArrowLeft' ? -1 : 1;
        showPoint(activePointIndex);
      });
      window.addEventListener('resize', () => { hideTooltip(); draw(); });
      draw();
    })();
  </script>
</body>
</html>`;
}
