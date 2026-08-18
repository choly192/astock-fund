import * as assert from 'assert';
import { RefreshQueue } from '../../shared/refreshQueue';

suite('Refresh queue', () => {
  test('coalesces concurrent requests and runs one trailing refresh', async () => {
    let calls = 0;
    let release: (() => void) | undefined;
    const firstTask = new Promise<void>((resolve) => { release = resolve; });
    const queue = new RefreshQueue(async () => {
      calls += 1;
      if (calls === 1) await firstTask;
    });

    const first = queue.run();
    const second = queue.run();
    queue.run();
    assert.equal(calls, 1);
    release!();
    await Promise.all([first, second]);
    assert.equal(calls, 2);
  });

  test('starts a new cycle after the queue becomes idle', async () => {
    let calls = 0;
    const queue = new RefreshQueue(async () => { calls += 1; });
    await queue.run();
    await queue.run();
    assert.equal(calls, 2);
  });
});
