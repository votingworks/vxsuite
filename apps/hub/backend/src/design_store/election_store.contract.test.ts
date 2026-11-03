import { randomUUID } from 'node:crypto';
import { describeDesignElectionStoreTests } from '@votingworks/design-backend/contract';
import { BaseLogger, LogSource } from '@votingworks/logging';
import { Db } from './db/db.js';
import { runDesignMigrations } from './run_design_migrations.js';
import { ElectionStore } from './election_store.js';

const JURISDICTION_ID = 'contract-jurisdiction';

describeDesignElectionStoreTests('Postgres (VxHub)', async (stateFeatures) => {
  const schemaName = `contract_${randomUUID().replaceAll('-', '_')}`;
  const db = new Db(new BaseLogger(LogSource.System), {
    defaultSchemaName: schemaName,
  });
  await db.withClient(async (client) => {
    await runDesignMigrations(client, { schemaName, noLock: true });
    await client.query(
      `insert into organizations (id, name) values ('org', 'Org')`
    );
    await client.query(
      `insert into jurisdictions (id, name, organization_id, state_code)
       values ($1, 'Jurisdiction', 'org', 'DEMO')`,
      JURISDICTION_ID
    );
  });
  return {
    store: new ElectionStore(db, {
      getStateFeatures: () => Promise.resolve(stateFeatures),
    }),
    jurisdictionId: JURISDICTION_ID,
    async cleanUp() {
      await db.withClient((client) =>
        client.query(`drop schema if exists ${schemaName} cascade`)
      );
      await db.close();
    },
  };
});
