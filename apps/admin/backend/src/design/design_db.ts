import {
  BackgroundTaskStore,
  Db,
  ElectionStore,
  readDesignSchema,
} from '@votingworks/design-backend';
import type { BaseLogger } from '@votingworks/logging';
import type { ElectionId, StateCode } from '@votingworks/types';
import { isNodeEnvProduction } from '@votingworks/utils';
import type { StateFeaturesConfig } from '@votingworks/design-backend';

export const LOCAL_ORGANIZATION_ID = 'vxadmin-local';
export const LOCAL_JURISDICTION_ID = 'vxadmin-local';
export const LOCAL_ORGANIZATION_NAME = 'VxAdmin';
export const LOCAL_JURISDICTION_NAME = 'Local Jurisdiction';

const PRODUCTION_DESIGN_DATABASE_URL =
  'postgresql://vx-services@/vxadmin_design?host=/var/run/postgresql';
const DEVELOPMENT_DESIGN_DATABASE_URL =
  'postgresql://design:design@localhost:5432/vxadmin_design';

export function designDatabaseUrl(): string {
  return (
    process.env.ADMIN_DESIGN_DATABASE_URL ??
    (isNodeEnvProduction()
      ? PRODUCTION_DESIGN_DATABASE_URL
      : DEVELOPMENT_DESIGN_DATABASE_URL)
  );
}

export interface AdminDesignStores {
  readonly db: Db;
  readonly elections: ElectionStore;
  readonly tasks: BackgroundTaskStore;
}

async function ensureDatabaseExists(
  logger: BaseLogger,
  databaseUrl: string
): Promise<void> {
  const url = new URL(databaseUrl);
  const databaseName = url.pathname.replace(/^\//, '');
  if (!/^\w+$/.test(databaseName)) {
    throw new Error(`Invalid design database name: ${databaseName}`);
  }
  url.pathname = '/postgres';
  const maintenanceDb = new Db(logger, { connectionString: url.toString() });
  try {
    await maintenanceDb.withClient(async (client) => {
      const { rowCount } = await client.query(
        'select 1 from pg_database where datname = $1',
        databaseName
      );
      if (rowCount === 0) {
        await client.query(`create database ${databaseName}`);
      }
    });
  } finally {
    await maintenanceDb.close();
  }
}

async function applyDesignSchema(db: Db): Promise<void> {
  const schema = readDesignSchema();
  await db.withClient(async (client) => {
    const { rows } = await client.query(
      `select to_regclass('public.design_schema_version') as "versionTable",
        (select count(*)::int from information_schema.tables
         where table_schema = 'public') as "tableCount"`
    );
    const { versionTable, tableCount } = rows[0] as {
      versionTable: string | null;
      tableCount: number;
    };
    let appliedHash: string | undefined;
    if (versionTable) {
      const { rows: versionRows } = await client.query(
        'select hash from design_schema_version'
      );
      appliedHash = (versionRows[0] as { hash: string } | undefined)?.hash;
      if (appliedHash === schema.hash) return;
    }
    if (versionTable || tableCount > 0) {
      if (isNodeEnvProduction()) {
        throw new Error(
          'The design database schema does not match this software version.'
        );
      }
      await client.query('drop schema public cascade');
      await client.query('create schema public');
    }
    await client.withTransaction(async () => {
      await client.query(schema.sql);
      await client.query(
        'create table public.design_schema_version (hash text not null)'
      );
      await client.query(
        'insert into public.design_schema_version (hash) values ($1)',
        schema.hash
      );
      return true;
    });
  });
}

export async function syncLocalJurisdiction(
  db: Db,
  stateCode: StateCode
): Promise<void> {
  await db.withClient(async (client) => {
    await client.query(
      `insert into organizations (id, name) values ($1, $2)
       on conflict (id) do nothing`,
      LOCAL_ORGANIZATION_ID,
      LOCAL_ORGANIZATION_NAME
    );
    await client.query(
      `insert into jurisdictions (id, name, organization_id, state_code)
       values ($1, $2, $3, $4)
       on conflict (id) do update set state_code = excluded.state_code`,
      LOCAL_JURISDICTION_ID,
      LOCAL_JURISDICTION_NAME,
      LOCAL_ORGANIZATION_ID,
      stateCode
    );
  });
}

export async function openDesignStores(
  logger: BaseLogger,
  {
    getStateFeatures,
  }: {
    getStateFeatures: (electionId: ElectionId) => Promise<StateFeaturesConfig>;
  }
): Promise<AdminDesignStores> {
  const databaseUrl = designDatabaseUrl();
  if (!isNodeEnvProduction()) {
    await ensureDatabaseExists(logger, databaseUrl);
  }
  const db = new Db(logger, { connectionString: databaseUrl });
  try {
    await applyDesignSchema(db);
    return {
      db,
      elections: new ElectionStore(db, { getStateFeatures }),
      tasks: new BackgroundTaskStore(db),
    };
  } catch (error) {
    await db.close();
    throw error;
  }
}
