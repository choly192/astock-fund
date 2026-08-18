import * as assert from 'assert';
import {
  addFundToGroup,
  moveFundWithinGroup,
  normalizeFundGroupConfig,
  parseFundCodeInput,
  removeFundGroupAt,
} from '../../shared/fundConfig';

suite('Fund group configuration', () => {
  test('migrates a flat fund list into the default fund group', () => {
    assert.deepStrictEqual(normalizeFundGroupConfig(['110022', '000001'], []), {
      names: ['我的基金'],
      lists: [['110022', '000001']],
    });
  });

  test('keeps each fund in only one group', () => {
    const result = addFundToGroup(
      { names: ['指数基金', '主动基金'], lists: [['110022'], ['000001']] },
      1,
      '110022'
    );
    assert.deepStrictEqual(result.lists, [[], ['000001', '110022']]);
  });

  test('moves a fund within its group', () => {
    const result = moveFundWithinGroup(
      { names: ['我的基金'], lists: [['110022', '000001']] },
      0,
      '000001',
      -1
    );
    assert.deepStrictEqual(result.lists[0], ['000001', '110022']);
  });

  test('merges funds into the first group when deleting another group', () => {
    assert.deepStrictEqual(removeFundGroupAt(
      { names: ['指数基金', '主动基金'], lists: [['000001'], ['110022']] },
      1
    ), {
      names: ['指数基金'],
      lists: [['000001', '110022']],
    });
  });

  test('allows deleting the final fund group without creating a placeholder', () => {
    const result = removeFundGroupAt(
      { names: ['临时分组'], lists: [['110022']] },
      0
    );
    assert.deepStrictEqual(result, { names: [], lists: [] });
    assert.deepStrictEqual(normalizeFundGroupConfig(result.lists, result.names), result);
  });

  test('parses pasted fund codes and reports invalid entries', () => {
    assert.deepStrictEqual(parseFundCodeInput('110022, 000001；110022 test'), {
      codes: ['110022', '000001'],
      invalid: ['test'],
    });
  });
});
