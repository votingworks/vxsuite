import {
  Db,
  type StateCode,
  Store,
  type Jurisdiction,
} from '@votingworks/design-backend';
import type { BaseLogger } from '@votingworks/logging';
import { LATEST_SOFTWARE_VERSION } from '@votingworks/types';

export const LOCAL_ORGANIZATION_ID = 'vxadmin-local';
export const LOCAL_JURISDICTION_ID = 'vxadmin-local';
const DEFAULT_STATE_CODE: StateCode = 'DEMO';

export function designDatabaseUrl(): string {
  return (
    process.env.ADMIN_DESIGN_DATABASE_URL ??
    'postgresql://design:design@localhost:5432/vxadmin_design'
  );
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

async function ensureLocalJurisdiction(store: Store): Promise<void> {
  const organizations = await store.listOrganizations();
  if (!organizations.some((o) => o.id === LOCAL_ORGANIZATION_ID)) {
    await store.createOrganization({
      id: LOCAL_ORGANIZATION_ID,
      name: 'VxAdmin',
    });
  }
  const jurisdictions = await store.listJurisdictions();
  if (!jurisdictions.some((j) => j.id === LOCAL_JURISDICTION_ID)) {
    await store.createJurisdiction({
      id: LOCAL_JURISDICTION_ID,
      name: 'Local Jurisdiction',
      stateCode: DEFAULT_STATE_CODE,
      softwareVersion: LATEST_SOFTWARE_VERSION,
      organization: { id: LOCAL_ORGANIZATION_ID, name: 'VxAdmin' },
    });
  }
}

export async function createDesignStore(logger: BaseLogger): Promise<Store> {
  const databaseUrl = designDatabaseUrl();
  await ensureDatabaseExists(logger, databaseUrl);
  const db = new Db(logger, { connectionString: databaseUrl });
  await db.withClient((client) =>
    client.runMigrations({ schemaName: 'public' })
  );
  const store = new Store(db);
  await ensureLocalJurisdiction(store);
  return store;
}

export function getLocalJurisdiction(store: Store): Promise<Jurisdiction> {
  return store.getJurisdiction(LOCAL_JURISDICTION_ID);
}
