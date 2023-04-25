import { computeFullElectionTally } from '@votingworks/utils';
import { join } from 'path';
import { electionMinimalExhaustiveSampleDefinition } from '@votingworks/fixtures';
import { assert } from '@votingworks/basics';
import { CastVoteRecord } from '@votingworks/types';
import {
  buildTestEnvironment,
  configureMachine,
  mockElectionManagerAuth,
} from '../test/app';
import { getBackupPath, takeBackup } from '../test/backups';
import { getPerformanceTimer } from '../test/timer';

// depending on the test conditions, may need to increase this
jest.setTimeout(600000);

const electionDefinition = electionMinimalExhaustiveSampleDefinition;

test.skip('load CVR files', async () => {
  const timer = getPerformanceTimer();
  const { apiClient, workspace, auth } = buildTestEnvironment();
  await configureMachine(apiClient, auth, electionDefinition);
  mockElectionManagerAuth(auth, electionDefinition.electionHash);
  timer.checkpoint(`setup complete`);

  for (let i = 1; i <= 10; i += 1) {
    // load reports generated with libs/cvr-fixture-generator to ../perf-fixtures
    const reportDirectoryPath = join(
      __dirname,
      '../perf-fixtures',
      '10000',
      i.toString()
    );
    const addReportResult = await apiClient.addCastVoteRecordFile({
      path: reportDirectoryPath,
    });
    assert(addReportResult.isOk());
    timer.checkpoint(`file ${i} added`);
  }

  takeBackup({
    workspace,
    backupName: 'performance',
  });
});

test.skip('tally performance', () => {
  const timer = getPerformanceTimer();
  const { workspace, auth } = buildTestEnvironment(
    getBackupPath('performance')
  );
  mockElectionManagerAuth(auth, electionDefinition.electionHash);
  timer.checkpoint(`setup complete`);

  const records = workspace.store.getCastVoteRecordEntries(
    workspace.store.getCurrentElectionId()!
  );
  timer.checkpoint(`${records.length} cvrs retrieved from store`);

  const parsed = records.map(({ data }) => JSON.parse(data) as CastVoteRecord);
  timer.checkpoint('cvrs parsed');

  const filtered = parsed.filter((cvr) => cvr._scannerId === 'scanner-1');
  timer.checkpoint('cvrs filtered');

  computeFullElectionTally(electionDefinition.election, new Set(filtered));
  timer.checkpoint('tally complete');

  timer.end();
});
