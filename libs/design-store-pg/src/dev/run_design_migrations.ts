import * as migrate from 'node-pg-migrate';
import type { Client } from '../db/client.js';
import {
  DESIGN_MIGRATIONS_DIR,
  DESIGN_MIGRATIONS_TABLE,
} from '../db/client.js';

export async function runDesignMigrations(
  client: Client,
  { schemaName, noLock }: { schemaName: string; noLock?: boolean }
): Promise<void> {
  await migrate.runner({
    createMigrationsSchema: true,
    createSchema: true,
    dbClient: client.pgClient,
    noLock,
    dir: DESIGN_MIGRATIONS_DIR,
    direction: 'up',
    log: () => {},
    migrationsSchema: schemaName,
    migrationsTable: DESIGN_MIGRATIONS_TABLE,
    schema: schemaName,
  });
}
