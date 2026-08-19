import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
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

    const chartClient = fs.readFileSync(
      path.join(projectRoot, 'src', 'webview', 'stockChartClient.ts'),
      'utf8'
    );
    assert.ok(chartClient.includes('attributionLogo: false'));
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
