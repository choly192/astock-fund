import * as assert from 'assert';
import {
  addStockToGroup,
  moveStockWithinGroup,
  normalizeStockGroupConfig,
  parseStockCodeInput,
  removeStockGroupAt,
} from '../../shared/stockEagleEyeConfig';

suite('Stock group configuration', () => {
  test('migrates a flat stock list into the default group', () => {
    const result = normalizeStockGroupConfig(['sh000001', 'hk00700'], []);
    assert.deepStrictEqual(result, {
      names: ['指数'],
      lists: [['sh000001', 'hk00700']],
    });
  });

  test('keeps each stock in only one group', () => {
    const result = addStockToGroup(
      { names: ['指数', '科技'], lists: [['sh000001', 'hk00700'], []] },
      1,
      'hk00700'
    );
    assert.deepStrictEqual(result.lists, [['sh000001'], ['hk00700']]);
  });

  test('moves a stock within its group', () => {
    const result = moveStockWithinGroup(
      { names: ['自选'], lists: [['sh000001', 'sh000300']] },
      0,
      'sh000300',
      -1
    );
    assert.deepStrictEqual(result.lists[0], ['sh000300', 'sh000001']);
  });

  test('merges stocks into the first remaining group when deleting a group', () => {
    const result = removeStockGroupAt(
      { names: ['指数', '科技'], lists: [['sh000001'], ['hk00700']] },
      1
    );
    assert.deepStrictEqual(result, {
      names: ['指数'],
      lists: [['sh000001', 'hk00700']],
    });
  });

  test('does not create a placeholder group when names and lists are temporarily mismatched', () => {
    const result = normalizeStockGroupConfig(
      [['sh000001'], ['hk00700']],
      ['指数']
    );
    assert.deepStrictEqual(result, {
      names: ['指数'],
      lists: [['sh000001', 'hk00700']],
    });
  });

  test('allows deleting the final group', () => {
    const result = removeStockGroupAt(
      { names: ['临时分组'], lists: [['sh000001']] },
      0
    );
    assert.deepStrictEqual(result, { names: [], lists: [] });
    assert.deepStrictEqual(normalizeStockGroupConfig(result.lists, result.names), result);
  });

  test('normalizes pasted A-share, Hong Kong and US stock codes', () => {
    assert.deepStrictEqual(parseStockCodeInput('600519, 000001；hk00700 NVDA bad/code'), {
      codes: ['sh600519', 'sz000001', 'hk00700', 'usr_nvda'],
      invalid: ['bad/code'],
    });
  });
});
