import { expect, test } from 'vitest';
import { NetworkCvrImportQueue } from './network_cvr_transfer.js';

test('NetworkCvrImportQueue keeps running after a rejected task', async () => {
  const queue = new NetworkCvrImportQueue();
  await expect(
    queue.run(() => Promise.reject(new Error('boom')))
  ).rejects.toThrow('boom');
  expect(await queue.run(() => Promise.resolve('next'))).toEqual('next');
});
