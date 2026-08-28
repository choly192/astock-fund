import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { calculateMovingAverage } from '../../webview/movingAverage';
import { getEastMoneyStockTarget, getStockTrendHtml } from '../../webview/stockTrendHtml';

const projectRoot = path.resolve(__dirname, '../../..');

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
