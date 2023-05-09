import { computeFullElectionTally } from '@votingworks/utils';
import { electionMinimalExhaustiveSampleDefinition } from '@votingworks/fixtures';
import { CastVoteRecord } from '@votingworks/types';
import { buildTestEnvironment, mockElectionManagerAuth } from '../test/app';
import { getBackupPath } from '../test/backups';
import { getPerformanceTimer } from '../test/timer';
import { getExampleTally } from '../src/util/votes';

jest.setTimeout(30000);

const electionDefinition = electionMinimalExhaustiveSampleDefinition;

test('tally performance', () => {
  const timer = getPerformanceTimer();
  const { workspace, auth } = buildTestEnvironment(
    getBackupPath('performance')
  );
  mockElectionManagerAuth(auth, electionDefinition.electionHash);
  timer.checkpoint(`test setup complete`);

  const tally = getExampleTally(workspace.store);

  console.log(JSON.stringify(tally, undefined, 2));
  timer.checkpoint('tally complete');

  timer.end();
});
