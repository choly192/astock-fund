import * as assert from 'assert';
import { isAnyStockMarketOpen } from '../../shared/utils';

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
});
