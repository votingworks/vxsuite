import { vi } from 'vitest';
import { TEST_JURISDICTION } from '@votingworks/types';
import type { ElectionPackageStore } from '../election_package/store.js';
import type { PartialElectionPackage } from '../election_package/test_utils.js';
import { importElectionPackageForTest } from '../test_utils.js';

/** A machine store configured by importing an election package. */
export interface ElectionSessionStore {
  getElectionPackageStore(): ElectionPackageStore;
  startElectionSession(): void;
  setPollingPlaceId(id: string): void;
}

/** Configures `store` from a package built from the given parts, as the app does. */
export async function configureStoreForTest(
  store: ElectionSessionStore,
  {
    jurisdiction = TEST_JURISDICTION,
    electionPackageHash = 'test-election-package-hash',
    pollingPlaceId,
    ...electionPackage
  }: PartialElectionPackage & {
    jurisdiction?: string;
    electionPackageHash?: string;
    pollingPlaceId?: string;
  }
): Promise<void> {
  // Building and streaming the package zip stalls under fake timers.
  const fakeTimers = vi.isFakeTimers();
  if (fakeTimers) vi.useRealTimers();
  try {
    await importElectionPackageForTest(
      store.getElectionPackageStore(),
      electionPackage,
      { jurisdiction, electionPackageHash }
    );
  } finally {
    if (fakeTimers) vi.useFakeTimers();
  }
  store.startElectionSession();
  if (pollingPlaceId) {
    store.setPollingPlaceId(pollingPlaceId);
  }
}
