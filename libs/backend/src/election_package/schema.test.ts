import { Client } from '@votingworks/db';
import { test } from 'vitest';
import { ELECTION_PACKAGE_SCHEMA_PATH } from './schema.js';

test('schema is valid', () => {
  Client.memoryClient(ELECTION_PACKAGE_SCHEMA_PATH).assertSchemaIsValid();
});
