import { vi } from 'vitest';
import { importElectionPackageForTest } from '@votingworks/backend/test-utils';
import {
  type ElectionDefinition,
  type EncodedBallotEntry,
  type SystemSettings,
  TEST_JURISDICTION,
} from '@votingworks/types';
import { ELECTION_PACKAGE_INCLUDE, type Store } from '../src/store.js';

/**
 * Configures `store` from a package built from `electionDefinition`, the way
 * the app does, and starts the election session.
 */
export async function configureStore(
  store: Store,
  {
    electionDefinition,
    systemSettings,
    ballots,
    jurisdiction = TEST_JURISDICTION,
    electionPackageHash = 'test-election-package-hash',
  }: {
    electionDefinition: ElectionDefinition;
    systemSettings?: SystemSettings;
    ballots?: EncodedBallotEntry[];
    jurisdiction?: string;
    electionPackageHash?: string;
  }
): Promise<void> {
  // Importing streams the package zip, which stalls under fake timers.
  const fakeTimers = vi.isFakeTimers();
  if (fakeTimers) vi.useRealTimers();
  await importElectionPackageForTest(
    store.getElectionPackageStore(),
    { electionDefinition, systemSettings, ballots },
    {
      jurisdiction,
      electionPackageHash,
      include: ELECTION_PACKAGE_INCLUDE,
    }
  );
  if (fakeTimers) vi.useFakeTimers();
  store.startElectionSession();
}
