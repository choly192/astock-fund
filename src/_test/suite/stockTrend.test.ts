import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { calculateMovingAverage } from '../../webview/movingAverage';
import {
  combineConfirmedAndProvisionalSignals,
  getCompletedSignalPoints,
  selectChanSignalsForDisplay,
} from '../../webview/chanSignalDisplay';
import { getEastMoneyStockTarget, getStockTrendHtml } from '../../webview/stockTrendHtml';
import type { ChanSignal, ChanSignalLevel, ChanSignalVariant } from '../../chan/engine';

const projectRoot = path.resolve(__dirname, '../../..');

function signal(
  variant: ChanSignalVariant,
  level: ChanSignalLevel,
  confirmedIndex: number,
  time = '2026-08-20',
  side: ChanSignal['side'] = 'buy'
): ChanSignal {
  return {
    id: `${variant}:${level}:${confirmedIndex}`,
    side,
    level,
    variant,
    time,
    price: 10,
    strokeIndex: -1,
    confirmedIndex,
    confirmedTime: `2026-08-${String(confirmedIndex).padStart(2, '0')}`,
    reason: 'test',
    algorithmVersion: '1.1.1',
  };
}

suite('Stock trend webview', () => {
  test('maps supported markets to East Money market identifiers', () => {
    assert.deepStrictEqual(getEastMoneyStockTarget('sh000001'), {
      market: 1,
      symbol: '000001',
      secid: '1.000001',
      url: 'https://quote.eastmoney.com/basic/full.html?mcid=1.000001',
    });
    assert.equal(getEastMoneyStockTarget('sz000001').market, 0);
    assert.equal(getEastMoneyStockTarget('bj430047').market, 0);
    assert.equal(getEastMoneyStockTarget('hk00700').market, 116);
    assert.equal(getEastMoneyStockTarget('usr_nvda').url,
      'https://quote.eastmoney.com/basic/full.html?mcid=105.NVDA');
  });

  test('renders native multi-period chart controls on a dark background', () => {
    const html = getStockTrendHtml({
      code: 'sh000001',
      name: '上证指数',
      price: '3635.13',
      percent: '0.34',
    }, 'stockChart.js', 'vscode-webview:');
    assert.ok(!html.includes('<iframe'));
    assert.ok(html.includes('basic/full.html?mcid=1.000001'));
    assert.ok(html.includes('background: #0b0d10'));
    assert.ok(html.includes('data-period="trend"'));
    assert.ok(html.includes('data-period="60m"'));
    assert.ok(html.includes('stockChart.js'));
    assert.ok(html.includes('正在加载行情'));
    assert.ok(html.includes('script-src vscode-webview:'));
    assert.ok(!html.includes('image.sinajs.cn'));
    assert.ok(!html.includes('旧数据'));
    assert.ok(!html.includes('<dt>获取</dt>'));
    assert.ok(html.includes('class="latest-point"'));
    assert.ok(html.includes('@keyframes latest-point-pulse'));
    assert.ok(html.includes('data-stat="volume"'));
    assert.ok(html.includes('class="quote-time"'));
    assert.ok(html.includes('class="ma-legend"'));
    assert.ok(html.includes('class="chart-toolbar"'));
    assert.ok(html.includes('class="signal-toggle chan-toggle"'));
    assert.ok(html.includes('class="signal-toggle tdx-toggle"'));
    assert.ok(html.includes('新缠论'));
    assert.ok(html.includes('支持日 K、周 K 和分钟 K'));
    assert.ok(html.includes('role="switch"'));

    const chartClient = fs.readFileSync(
      path.join(projectRoot, 'src', 'webview', 'stockChartClient.ts'),
      'utf8'
    );
    assert.ok(chartClient.includes('attributionLogo: false'));
    assert.ok(chartClient.includes('TREND_POLL_INTERVAL_MS = 5000'));
    assert.ok(chartClient.includes('MINUTE_POLL_INTERVAL_MS = 15000'));
    assert.ok(chartClient.includes("document.addEventListener('visibilitychange'"));
    assert.ok(chartClient.includes('requestPeriod(currentPeriod, true)'));
    assert.ok(chartClient.includes('均价'));
    assert.ok(chartClient.includes("label: 'MA60'"));
    assert.ok(chartClient.includes('calculateMovingAverage'));
    assert.ok(chartClient.includes('chart.addCustomSeries'));
    assert.ok(chartClient.includes('renderChanSignalPane'));
    assert.ok(chartClient.includes("chanSignalsVisible"));
    assert.ok(chartClient.includes("tdxSignalsVisible"));
    assert.ok(chartClient.includes('enableTdxMultiscale: showTdxSignals'));
    assert.ok(chartClient.includes('getTdxReversalRatios(period)'));
  });

  test('calculates moving averages from closing prices', () => {
    const points = [10, 11, 12, 13, 14].map((close, index) => ({
      time: `2026-08-${String(index + 1).padStart(2, '0')}`,
      close,
    }));
    assert.deepStrictEqual(calculateMovingAverage(points, 3), [
      { time: '2026-08-03', value: 11 },
      { time: '2026-08-04', value: 12 },
      { time: '2026-08-05', value: 13 },
    ]);
    assert.deepStrictEqual(calculateMovingAverage(points, 10), []);
    assert.throws(() => calculateMovingAverage(points, 0), /正整数/);
  });

  test('shows only the stronger TDX signal when one and two share a pivot', () => {
    const classTwo = signal('tdx-class-two', 2, 21);
    const firstBuy = signal('tdx-multiscale', 1, 34);
    const matches = [classTwo, firstBuy];

    const visible = selectChanSignalsForDisplay(matches, {
      standardVisible: false,
      tdxVisible: true,
    });

    assert.deepStrictEqual(visible, [firstBuy]);
    assert.deepStrictEqual(matches, [classTwo, firstBuy]);
  });

  test('keeps standard and TDX visibility switches independent', () => {
    const standard = signal('standard', 3, 10, '2026-08-19');
    const tdx = signal('tdx-multiscale', 1, 20, '2026-08-20');
    const matches = [standard, tdx];

    assert.deepStrictEqual(selectChanSignalsForDisplay(matches, {
      standardVisible: true,
      tdxVisible: false,
    }), [standard]);
    assert.deepStrictEqual(selectChanSignalsForDisplay(matches, {
      standardVisible: false,
      tdxVisible: true,
    }), [tdx]);
  });

  test('treats signals from an open minute bar as provisional', () => {
    const points = [10, 11, 12].map((close, index) => ({
      time: index,
      open: close,
      high: close,
      low: close,
      close,
      volume: 1,
    }));
    assert.deepStrictEqual(getCompletedSignalPoints(points, '5m', true), points.slice(0, -1));
    assert.equal(getCompletedSignalPoints(points, '5m', false), points);
    assert.equal(getCompletedSignalPoints(points, 'day', true), points);

    const confirmed = signal('tdx-class-two', 2, 10, '2026-08-19');
    const live = signal('tdx-multiscale', 1, 20, '2026-08-20');
    const combined = combineConfirmedAndProvisionalSignals(
      [confirmed],
      [confirmed, live]
    );
    assert.equal(combined[0], confirmed);
    assert.deepStrictEqual(combined[1], { ...live, provisional: true });
  });

  test('escapes quote text before placing it in HTML', () => {
    const html = getStockTrendHtml({
      code: 'sh000001',
      name: '<script>alert(1)</script>',
      percent: '--',
    }, 'stockChart.js', 'vscode-webview:');
    assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
    assert.ok(!html.includes('<script>alert(1)</script>'));
  });
});
