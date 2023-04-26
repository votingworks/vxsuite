import { computeFullElectionTally } from '@votingworks/utils';
import { electionMinimalExhaustiveSampleDefinition } from '@votingworks/fixtures';
import { CastVoteRecord } from '@votingworks/types';
import { buildTestEnvironment, mockElectionManagerAuth } from '../test/app';
import { getBackupPath } from '../test/backups';
import { getPerformanceTimer } from '../test/timer';

jest.setTimeout(30000);

const electionDefinition = electionMinimalExhaustiveSampleDefinition;

test.skip('tally performance', () => {
  const timer = getPerformanceTimer();
  const { workspace, auth } = buildTestEnvironment(
    getBackupPath('performance')
  );
  mockElectionManagerAuth(auth, electionDefinition.electionHash);
  timer.checkpoint(`test setup complete`);

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
