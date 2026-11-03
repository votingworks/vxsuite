import { join } from 'node:path';
import { Client as DbClient } from '@votingworks/db';
import { describeDesignElectionStoreTests } from '@votingworks/design-backend/contract';
import { DesignStore, LOCAL_JURISDICTION_ID } from './design_store.js';

const SCHEMA_PATH = join(import.meta.dirname, '../../schema.sql');

describeDesignElectionStoreTests('SQLite (VxAdmin)', (stateFeatures) => {
  const client = DbClient.memoryClient(SCHEMA_PATH);
  return Promise.resolve({
    store: new DesignStore(client, { getStateFeatures: () => stateFeatures }),
    jurisdictionId: LOCAL_JURISDICTION_ID,
    cleanUp: () => {
      client.close();
      return Promise.resolve();
    },
  });
});
