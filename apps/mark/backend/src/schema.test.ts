import { test } from 'vitest';
import { Client } from '@votingworks/db';
import { join } from 'node:path';

test('schema is valid', () => {
  Client.memoryClient(
    join(import.meta.dirname, '../schema.sql')
  ).assertSchemaIsValid();
});
