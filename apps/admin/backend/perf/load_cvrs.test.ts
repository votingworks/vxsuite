import { test, vi } from 'vitest';
import { join } from 'node:path';
import { readElectionTwoPartyPrimaryDefinition } from '@votingworks/fixtures';
import {
  buildTestEnvironment,
  configureMachine,
  mockElectionManagerAuth,
} from '../test/app';
import { takeBackup } from '../test/backups';
import { getPerformanceTimer } from '../test/timer';

// depending on the test conditions, you may need to increase this
vi.setConfig({
  testTimeout: 3000000,
});

const electionDefinition = readElectionTwoPartyPrimaryDefinition();

// reports can be generated from "libs/fixture-generators"
const NUM_REPORTS = 100;
const RECORDS_PER_REPORT = 10000;

test('loading CVR file performance', async () => {
  const timer = getPerformanceTimer();
  const { apiClient, workspace, auth } = buildTestEnvironment();
  await configureMachine(apiClient, auth, electionDefinition);
  mockElectionManagerAuth(auth, electionDefinition.election);
  timer.checkpoint(`test setup complete`);

  for (let i = 0; i < NUM_REPORTS; i += 1) {
    const reportDirectoryPath = join(
      __dirname,
      'fixtures',
      RECORDS_PER_REPORT.toString(),
      i.toString()
    );
    (
      await apiClient.addCastVoteRecordFile({
        path: reportDirectoryPath,
      })
    ).unsafeUnwrap();
    timer.checkpoint(`file ${i} added`);
  }

  // to experiment with the performance of querying or exporting these records,
  // we can save a backup. add the "override" argument if you want to overwrite
  // existing backups of the same name
  takeBackup({
    workspace,
    backupName: 'performance',
  });
});
