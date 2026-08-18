import * as assert from 'assert';
import { FundTreeItem } from '../../shared/fundTreeItem';
import { StockTreeItem } from '../../shared/stockTreeItem';

suite('Sidebar quote items', () => {
  test('keeps stock and fund group rows free of quote summaries', () => {
    const stockGroup = new StockTreeItem({
      code: '', name: '自选股 (2)', percent: '', contextValue: 'stockGroup',
    }, undefined, true);
    const fundGroup = new FundTreeItem({
      code: '', name: '我的基金 (1)', netValue: '', percent: '', contextValue: 'fundGroup',
    }, undefined, true);
    assert.equal(stockGroup.description, undefined);
    assert.equal(stockGroup.tooltip, undefined);
    assert.equal(fundGroup.description, undefined);
    assert.equal(fundGroup.tooltip, undefined);
  });

  test('shows stock name, price and daily return without cache status', () => {
    const item = new StockTreeItem({
      code: 'sh000001', name: '上证指数', price: '3600.00', percent: '0.20', stale: true,
    });
    assert.equal(item.label, '上证指数');
    assert.equal(item.description, '3600.00  +0.20%');
    assert.ok(!String(item.tooltip).includes('旧数据'));
    assert.ok(!String(item.tooltip).includes('获取时间'));
  });

  test('shows fund name, net value and daily return separately', () => {
    const item = new FundTreeItem({
      code: '110022', name: '测试基金', netValue: '2.5000', percent: '-1.20',
    });
    assert.equal(item.label, '测试基金');
    assert.equal(item.description, '2.5000  -1.20%');
  });
});
