import * as assert from 'assert';
import {
  getOpenStockCodes,
  isAnyStockMarketOpen,
  isAnyStockRegularMarketOpen,
} from '../../shared/utils';

suite('Market hours', () => {
  test('does not poll mainland stocks during the lunch break', () => {
    assert.equal(
      isAnyStockMarketOpen(['sh000001'], new Date('2026-08-14T04:00:00.000Z')),
      false
    );
  });

  test('polls mainland and Hong Kong stocks in their trading sessions', () => {
    assert.equal(
      isAnyStockMarketOpen(['sh000001'], new Date('2026-08-14T02:00:00.000Z')),
      true
    );
    assert.equal(
      isAnyStockMarketOpen(['hk00700'], new Date('2026-08-14T07:30:00.000Z')),
      true
    );
  });

  test('uses New York time for US extended trading hours', () => {
    assert.equal(
      isAnyStockMarketOpen(['usr_nvda'], new Date('2026-08-14T13:45:00.000Z')),
      true
    );
  });

  test('distinguishes regular chart sessions from quote refresh windows', () => {
    assert.equal(
      isAnyStockRegularMarketOpen(['sh000001'], new Date('2026-08-14T01:20:00.000Z')),
      false
    );
    assert.equal(
      isAnyStockRegularMarketOpen(['sh000001'], new Date('2026-08-14T02:00:00.000Z')),
      true
    );
    assert.equal(
      isAnyStockRegularMarketOpen(['usr_nvda'], new Date('2026-08-14T12:45:00.000Z')),
      false
    );
    assert.equal(
      isAnyStockRegularMarketOpen(['usr_nvda'], new Date('2026-08-14T14:00:00.000Z')),
      true
    );
  });

  test('returns only symbols whose own market is open', () => {
    const codes = ['sh000001', 'hk00700', 'usr_nvda'];
    assert.deepStrictEqual(
      getOpenStockCodes(codes, new Date('2026-08-14T02:00:00.000Z')),
      ['sh000001', 'hk00700']
    );
    assert.deepStrictEqual(
      getOpenStockCodes(codes, new Date('2026-08-14T14:00:00.000Z')),
      ['usr_nvda']
    );
  });
});
