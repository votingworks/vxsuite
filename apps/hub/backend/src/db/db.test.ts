import { expect, test, vi } from 'vitest';
import { mockBaseLogger } from '@votingworks/logging';
import { Db } from './db.js';

test('withClient discards a connection left in a failed transaction', async () => {
  const db = new Db(mockBaseLogger({ fn: vi.fn }), {
    defaultSchemaName: 'public',
  });

  await expect(
    db.withClient(async (client) => {
      await client.query('begin');
      await client.query('select 1 / 0');
    })
  ).rejects.toThrow('division by zero');

  const result = await db.withClient((client) =>
    client.query('select 1 as value')
  );
  expect(result.rows).toEqual([{ value: 1 }]);

  await db.close();
});
