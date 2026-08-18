import * as assert from 'assert';
import {
  parseEastMoneyKlineResponse,
  parseEastMoneyTrendResponse,
} from '../../explorer/stockTrendService';

suite('Stock trend data parsing', () => {
  test('parses daily candlesticks', () => {
    const result = parseEastMoneyKlineResponse({
      data: {
        prePrice: 10,
        klines: ['2026-08-17,10.00,10.50,10.80,9.90,120000,0'],
      },
    }, 'day');
    assert.equal(result.kind, 'candlestick');
    assert.deepStrictEqual(result.points[0], {
      time: '2026-08-17',
      open: 10,
      close: 10.5,
      high: 10.8,
      low: 9.9,
      volume: 120000,
    });
  });

  test('parses intraday price and average lines', () => {
    const result = parseEastMoneyTrendResponse({
      data: {
        prePrice: 10,
        trends: ['2026-08-18 09:31,10.20,10.10,10.25,10.05,2000,202000.00,10.12'],
      },
    });
    assert.equal(result.kind, 'line');
    assert.deepStrictEqual(result.points[0], {
      time: result.points[0].time,
      open: 10.2,
      close: 10.1,
      high: 10.25,
      low: 10.05,
      volume: 2000,
      average: 10.12,
    });
    assert.equal(result.points[0].time, Date.UTC(2026, 7, 18, 9, 31) / 1000);
  });
});
