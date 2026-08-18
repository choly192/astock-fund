import * as assert from 'assert';
import { mapSettledWithConcurrency } from '../../shared/async';

suite('Async concurrency', () => {
  test('limits concurrency and preserves result order', async () => {
    let active = 0;
    let maximum = 0;
    const results = await mapSettledWithConcurrency([1, 2, 3, 4, 5], 2, async (value) => {
      active += 1;
      maximum = Math.max(maximum, active);
      await new Promise((resolve) => setTimeout(resolve, 2));
      active -= 1;
      if (value === 3) throw new Error('expected');
      return value * 2;
    });

    assert.equal(maximum, 2);
    assert.deepStrictEqual(results.map((result) => result.status), [
      'fulfilled', 'fulfilled', 'rejected', 'fulfilled', 'fulfilled',
    ]);
    assert.equal(results[4].status === 'fulfilled' ? results[4].value : 0, 10);
  });
});
