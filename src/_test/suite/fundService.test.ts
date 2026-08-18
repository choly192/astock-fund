import * as assert from 'assert';
import {
  isFundQuoteCacheFresh,
  parseFundHistoryScript,
  parseFundSearchResponse,
  parseLatestNetValueResponse,
} from '../../explorer/fundService';

suite('Fund data parsing', () => {
  test('parses fund search results', () => {
    const result = parseFundSearchResponse({
      Datas: [{
        CODE: '110022',
        NAME: '易方达消费行业股票',
        FundBaseInfo: { FCODE: '110022', FTYPE: '股票型', DWJZ: 2.953, FSRQ: '2026-08-11' },
      }],
    });
    assert.deepStrictEqual(result, [{
      code: '110022',
      name: '易方达消费行业股票',
      fundType: '股票型',
      netValue: '2.953',
      date: '2026-08-11',
    }]);
  });

  test('parses the compact latest net value response', () => {
    assert.deepStrictEqual(parseLatestNetValueResponse({
      Data: { LSJZList: [{ FSRQ: '2026-08-11', DWJZ: '2.9530', LJJZ: '2.9530', JZZZL: '-1.07' }] },
    }), {
      date: '2026-08-11',
      netValue: '2.9530',
      cumulativeNetValue: '2.9530',
      percent: '-1.07',
    });
  });

  test('extracts only the required history assignments without evaluating script', () => {
    const parsed = parseFundHistoryScript(
      'var fS_name = "测试基金";var fS_code="110022";' +
      'var syl_1n="12.30";var syl_6y="5.20";var syl_3y="2.10";var syl_1y="1.00";' +
      'var Data_netWorthTrend=[{"x":1000,"y":1.1,"equityReturn":1.2},{"x":2000,"y":1.2,"equityReturn":2.3}];' +
      'var Data_grandTotal=[{"name":"本基金","data":[[1000,10],[2000,20]]}];',
      '000000'
    );
    assert.equal(parsed.code, '110022');
    assert.equal(parsed.name, '测试基金');
    assert.deepStrictEqual(parsed.netWorthTrend[1], { timestamp: 2000, value: 1.2, dailyReturn: 2.3 });
    assert.deepStrictEqual(parsed.cumulativeReturnTrend[0], { timestamp: 1000, value: 10 });
    assert.equal(parsed.returns.oneYear, '12.30');
  });

  test('reuses recent quotes and quotes already published today', () => {
    const now = Date.UTC(2026, 7, 18, 10, 0, 0);
    const info = { code: '110022', name: '测试基金', netValue: '2.5', percent: '1', date: '2026-08-18' };
    assert.equal(isFundQuoteCacheFresh(info, now - 5 * 60 * 1000, now), true);
    assert.equal(isFundQuoteCacheFresh(info, now - 24 * 60 * 60 * 1000, now), true);
    assert.equal(isFundQuoteCacheFresh({ ...info, date: '2026-08-17' }, now - 60 * 60 * 1000, now), false);
  });
});
