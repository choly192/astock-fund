import * as assert from 'assert';
import { getFundTrendHtml } from '../../webview/fundTrendHtml';

suite('Fund trend webview', () => {
  test('uses a nonce instead of unsafe inline script permission', () => {
    const html = getFundTrendHtml(
      { code: '110022', name: '测试基金', netValue: '2.5', percent: '1.2' },
      {
        code: '110022',
        name: '测试基金',
        netWorthTrend: [{ timestamp: 1, value: 2.5 }],
        cumulativeReturnTrend: [],
        returns: {},
      }
    );
    assert.ok(html.includes("script-src 'nonce-"));
    assert.ok(html.includes('<script nonce="'));
    assert.ok(!html.includes("script-src 'unsafe-inline'"));
  });
});
