import * as assert from 'assert';
import {
  aggregateTrendData,
  getTencentChartCode,
  parseTencentKlineResponse,
  parseTencentTrendResponse,
} from '../../shared/tencentStockChart';

function quote(): string[] {
  const fields = new Array(31).fill('');
  fields[4] = '9.80';
  fields[5] = '10.00';
  fields[30] = '20260818150000';
  return fields;
}

suite('Tencent stock chart parsing', () => {
  test('normalizes configured stock codes for chart requests', () => {
    assert.equal(getTencentChartCode('sh600519'), 'sh600519');
    assert.equal(getTencentChartCode('hk00700'), 'hk00700');
    assert.equal(getTencentChartCode('usr_nvda'), 'usNVDA');
  });

  test('parses cumulative intraday volume and amount', () => {
    const result = parseTencentTrendResponse({
      data: {
        sh600519: {
          data: {
            date: '20260818',
            data: [
              '0930 10.00 100 100000.00',
              '0931 10.20 250 252000.00',
              '1530 10.20 260 262200.00',
            ],
          },
          qt: { sh600519: quote() },
        },
      },
    }, 'sh600519');

    assert.equal(result.kind, 'line');
    assert.equal(result.points.length, 2);
    assert.equal(result.previousClose, 9.8);
    assert.equal(result.points[0].time, Date.UTC(2026, 7, 18, 9, 30) / 1000);
    assert.equal(result.points[1].open, 10);
    assert.equal(result.points[1].close, 10.2);
    assert.equal(result.points[1].volume, 150);
    assert.equal(result.points[1].average?.toFixed(2), '10.08');
  });

  test('parses adjusted daily and minute candlesticks', () => {
    const daily = parseTencentKlineResponse({
      data: {
        sh600519: {
          qfqday: [['2026-08-18', '10.00', '10.20', '10.30', '9.90', '1200']],
          prec: '9.80',
        },
      },
    }, 'sh600519', 'day');
    const minute = parseTencentKlineResponse({
      data: {
        sh600519: {
          m5: [['202608181000', '10.00', '10.20', '10.30', '9.90', '300']],
          prec: '9.80',
        },
      },
    }, 'sh600519', '5m');

    assert.equal(daily.points[0].time, '2026-08-18');
    assert.equal(daily.points[0].volume, 1200);
    assert.equal(minute.points[0].time, Date.UTC(2026, 7, 18, 10, 0) / 1000);
    assert.equal(minute.points[0].close, 10.2);
  });

  test('parses backward-adjusted K-lines for long-term validation', () => {
    const result = parseTencentKlineResponse({
      data: {
        sh600519: {
          hfqweek: [['2026-08-28', '1000', '1010', '1020', '990', '1200']],
        },
      },
    }, 'sh600519', 'week', 'hfq');
    assert.equal(result.points[0].close, 1010);
  });

  test('aggregates intraday points when minute K-lines are unavailable', () => {
    const trend = parseTencentTrendResponse({
      data: {
        hk00700: {
          data: {
            date: '20260818',
            data: [
              '0930 440.00 100 44000.00',
              '0931 442.00 180 79360.00',
            ],
          },
          qt: { hk00700: quote() },
        },
      },
    }, 'hk00700');
    const result = aggregateTrendData(trend, '5m');

    assert.equal(result.kind, 'candlestick');
    assert.equal(result.points.length, 1);
    assert.equal(result.points[0].close, 442);
    assert.equal(result.points[0].volume, 180);
  });
});
