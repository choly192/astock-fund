import * as assert from 'assert';
import {
  describeStockAlert,
  matchesStockAlert,
  StockAlertRule,
} from '../../alerts/stockAlertManager';

function rule(condition: StockAlertRule['condition'], value: number): StockAlertRule {
  return {
    id: '1', code: 'sh600519', name: '测试股票', condition, value,
    enabled: true, active: false, createdAt: 1,
  };
}

suite('Stock alerts', () => {
  test('matches price and percentage thresholds', () => {
    const info = { code: 'sh600519', name: '测试股票', price: '100', percent: '-2.5' };
    assert.equal(matchesStockAlert(rule('priceAbove', 99), info), true);
    assert.equal(matchesStockAlert(rule('priceBelow', 99), info), false);
    assert.equal(matchesStockAlert(rule('percentBelow', -2), info), true);
    assert.equal(matchesStockAlert(rule('percentAbove', 1), info), false);
  });

  test('describes thresholds with the correct unit', () => {
    assert.equal(describeStockAlert(rule('priceAbove', 100)), '价格达到 100.00');
    assert.equal(describeStockAlert(rule('percentBelow', -3)), '涨跌幅跌到 -3.00%');
  });
});
