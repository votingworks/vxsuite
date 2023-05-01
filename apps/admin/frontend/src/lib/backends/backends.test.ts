import { electionWithMsEitherNeitherFixtures } from '@votingworks/fixtures';
import { fakeLogger } from '@votingworks/logging';
import { VotingMethod } from '@votingworks/types';
import { MemoryStorage } from '@votingworks/utils';
import fetchMock from 'fetch-mock';
import { convertTalliesByPrecinctToFullManualTally } from '../../utils/manual_tallies';
import { ElectionManagerStoreAdminBackend } from './admin_backend';
import { ElectionManagerStoreMemoryBackend } from './memory_backend';

function makeMemoryBackend(): ElectionManagerStoreMemoryBackend {
  // disallow network access for in-memory backend
  fetchMock.reset().mock('*', (url) => {
    throw new Error(`Unexpected fetch: ${url}`);
  });

  return new ElectionManagerStoreMemoryBackend();
}

function makeAdminBackend(): ElectionManagerStoreAdminBackend {
  const storage = new MemoryStorage();
  const logger = fakeLogger();

  return new ElectionManagerStoreAdminBackend({
    storage,
    logger,
  });
}

describe.each([
  ['memory', makeMemoryBackend],
  ['admin', makeAdminBackend],
])('%s backend', (_backendName, makeBackend) => {
  test('full election tallies', async () => {
    const backend = makeBackend();
    expect(await backend.loadFullElectionManualTally()).toBeUndefined();
    const manualTally = convertTalliesByPrecinctToFullManualTally(
      { '6522': { contestTallies: {}, numberOfBallotsCounted: 100 } },
      electionWithMsEitherNeitherFixtures.election,
      VotingMethod.Absentee,
      new Date()
    );

    await backend.updateFullElectionManualTally(manualTally);
    expect(await backend.loadFullElectionManualTally()).toStrictEqual(
      manualTally
    );

    await backend.removeFullElectionManualTally();
    expect(await backend.loadFullElectionManualTally()).toBeUndefined();
  });
});
