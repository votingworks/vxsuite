import { electionMinimalExhaustiveSampleDefinition } from '@votingworks/fixtures';
import { buildTestEnvironment, mockElectionManagerAuth } from '../test/app';
import { getBackupPath } from '../test/backups';
import { getPerformanceTimer } from '../test/timer';

jest.setTimeout(30000);

const electionDefinition = electionMinimalExhaustiveSampleDefinition;

test.skip('tally performance', async () => {
  const timer = getPerformanceTimer();
  const { apiClient, auth } = buildTestEnvironment(
    getBackupPath('performance')
  );
  mockElectionManagerAuth(auth, electionDefinition.electionHash);
  timer.checkpoint(`test setup complete`);
  await apiClient.getResultsForTallyReports();
  timer.end();
});
