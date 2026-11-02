import { join } from 'node:path';
import * as migrate from 'node-pg-migrate';
import { assert } from '@votingworks/basics';
import {
  type Client,
  DESIGN_MIGRATIONS_DIR,
  DESIGN_MIGRATIONS_TABLE,
} from '@votingworks/design-backend';
import { NODE_ENV } from './globals.js';

export const HUB_MIGRATIONS_DIR = join(import.meta.dirname, '../migrations');
export const HUB_MIGRATIONS_TABLE = 'hub_pgmigrations';

export async function runMigrations(
  client: Client,
  params: { enableLogging?: boolean; schemaName: string; noLock?: boolean }
): Promise<void> {
  // @coverage-defer
  if (params.noLock) {
    assert(
      NODE_ENV === 'test',
      'Running migrations with `noLock` is only permitted in tests, ' +
        'which are run against separate schemas.'
    );
  }
  for (const [dir, migrationsTable] of [
    [DESIGN_MIGRATIONS_DIR, DESIGN_MIGRATIONS_TABLE],
    [HUB_MIGRATIONS_DIR, HUB_MIGRATIONS_TABLE],
  ] as const) {
    await migrate.runner({
      createMigrationsSchema: true,
      createSchema: true,
      dbClient: client.pgClient,
      noLock: params.noLock,
      dir,
      direction: 'up',
      // @coverage-defer
      log: params.enableLogging ? undefined : () => {},
      migrationsSchema: params.schemaName,
      migrationsTable,
      schema: params.schemaName,
    });
  }
}
