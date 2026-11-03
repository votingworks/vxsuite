import { join } from 'node:path';
import { Client as DbClient } from '@votingworks/db';
import { describeElectionStoreContract } from '@votingworks/design-backend/contract';
import { DEFAULT_SYSTEM_SETTINGS } from '@votingworks/types';
import { DesignStore } from './design_store.js';

const SCHEMA_PATH = join(import.meta.dirname, '../../schema.sql');

describeElectionStoreContract('SQLite (VxAdmin)', (stateFeatures) => {
  const client = DbClient.memoryClient(SCHEMA_PATH);
  const store = new DesignStore(client, {
    getStateFeatures: () => stateFeatures,
  });
  return Promise.resolve({
    store,
    createElection: (election) => {
      store.createElection({
        stateFeatures,
        election,
        isMiCombinedBallotPrimary: false,
        ballotTemplateId: 'VxDefaultBallot',
        systemSettings: DEFAULT_SYSTEM_SETTINGS,
      });
      return Promise.resolve();
    },
    cleanUp: () => {
      client.close();
      return Promise.resolve();
    },
  });
});
