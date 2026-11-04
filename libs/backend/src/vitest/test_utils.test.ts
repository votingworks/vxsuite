import { expect, test, vi } from 'vitest';
import { electionGeneralFixtures } from '@votingworks/fixtures';
import { TEST_JURISDICTION } from '@votingworks/types';
import { ElectionPackageStore } from '../election_package/store.js';
import {
  configureStoreForTest,
  type ElectionSessionStore,
} from './test_utils.js';

const electionDefinition = electionGeneralFixtures.readElectionDefinition();

function buildStore(): ElectionSessionStore & {
  sessionStarted: boolean;
  pollingPlaceId?: string;
} {
  const electionPackageStore = ElectionPackageStore.memoryStore({
    uiStrings: false,
    ballots: false,
    ballotPositions: false,
    candidateOrderings: false,
  });
  return {
    sessionStarted: false,
    getElectionPackageStore: () => electionPackageStore,
    startElectionSession() {
      this.sessionStarted = true;
    },
    setPollingPlaceId(id) {
      this.pollingPlaceId = id;
    },
  };
}

test('configureStoreForTest imports the package and starts the session', async () => {
  const store = buildStore();
  await configureStoreForTest(store, { electionDefinition });

  const electionPackageStore = store.getElectionPackageStore();
  expect(
    electionPackageStore.getElectionRecord()?.electionDefinition.ballotHash
  ).toEqual(electionDefinition.ballotHash);
  expect(electionPackageStore.getElectionRecord()?.electionPackageHash).toEqual(
    'test-election-package-hash'
  );
  expect(electionPackageStore.getJurisdiction()).toEqual(TEST_JURISDICTION);
  expect(store.sessionStarted).toEqual(true);
  expect(store.pollingPlaceId).toBeUndefined();
});

test('configureStoreForTest sets the polling place and keeps fake timers', async () => {
  vi.useFakeTimers();
  try {
    const store = buildStore();
    await configureStoreForTest(store, {
      electionDefinition,
      pollingPlaceId: 'polling-place-1',
    });

    expect(store.pollingPlaceId).toEqual('polling-place-1');
    expect(vi.isFakeTimers()).toEqual(true);
  } finally {
    vi.useRealTimers();
  }
});
