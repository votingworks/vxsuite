import { vi } from 'vitest';
import { importElectionPackageForTest } from '@votingworks/backend/test-utils';
import {
  type ElectionDefinition,
  type SystemSettings,
  TEST_JURISDICTION,
} from '@votingworks/types';
import type { Store } from '../src/store.js';

/**
 * Configures `store` from a package built from `electionPackage`, the way the
 * app does, and starts the election session.
 */
export async function configureStore(
  store: Store,
  {
    electionDefinition,
    systemSettings,
    jurisdiction = TEST_JURISDICTION,
    electionPackageHash = 'test-election-package-hash',
    pollingPlaceId,
  }: {
    electionDefinition: ElectionDefinition;
    systemSettings?: SystemSettings;
    jurisdiction?: string;
    electionPackageHash?: string;
    pollingPlaceId?: string;
  }
): Promise<void> {
  // Importing streams the package zip, which stalls under fake timers.
  const fakeTimers = vi.isFakeTimers();
  if (fakeTimers) vi.useRealTimers();
  await importElectionPackageForTest(
    store.getElectionPackageStore(),
    { electionDefinition, systemSettings },
    {
      jurisdiction,
      electionPackageHash,
    }
  );
  if (fakeTimers) vi.useFakeTimers();
  store.startElectionSession();
  if (pollingPlaceId) {
    store.setPollingPlaceId(pollingPlaceId);
  }
}
