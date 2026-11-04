import { vi } from 'vitest';
import { Client } from '@votingworks/db';
import { BaseLogger, LogSource } from '@votingworks/logging';
import {
  DEFAULT_SYSTEM_SETTINGS,
  type ElectionDefinition,
  TEST_JURISDICTION,
} from '@votingworks/types';
import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readElectionPackageFromFile } from './election_package/election_package_io.js';
import { ElectionPackageStore } from './election_package/store.js';
import {
  createElectionPackageZipArchive,
  type PartialElectionPackage,
} from './election_package/test_utils.js';

/**
 * Imports `electionPackage` into `store` the way configuring a machine does,
 * and returns the election package hash. `electionPackageHash` overrides the
 * hash of the zip for tests that assert on a known value.
 */
export async function importElectionPackageForTest(
  store: ElectionPackageStore,
  electionPackage: PartialElectionPackage,
  {
    jurisdiction = 'test-jurisdiction',
    electionPackageHash,
  }: {
    jurisdiction?: string;
    electionPackageHash?: string;
  } = {}
): Promise<string> {
  // Building and streaming the package zip stalls under fake timers.
  const fakeTimers = vi.isFakeTimers();
  if (fakeTimers) vi.useRealTimers();
  try {
    const filePath = join(
      mkdtempSync(join(tmpdir(), 'election-package-')),
      'election-package.zip'
    );
    writeFileSync(
      filePath,
      await createElectionPackageZipArchive(electionPackage)
    );
    const parsed = (await readElectionPackageFromFile(filePath)).unsafeUnwrap();
    const hash = electionPackageHash ?? parsed.electionPackageHash;
    await store.importElectionPackage({
      electionPackage: parsed.electionPackage,
      electionPackageHash: hash,
      filePath,
      jurisdiction,
      logger: new BaseLogger(LogSource.System),
    });
    return hash;
  } finally {
    if (fakeTimers) vi.useFakeTimers();
  }
}

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
  await importElectionPackageForTest(
    store.getElectionPackageStore(),
    electionPackage,
    { jurisdiction, electionPackageHash }
  );
  store.startElectionSession();
  if (pollingPlaceId) {
    store.setPollingPlaceId(pollingPlaceId);
  }
}

/**
 * Imports a single-file election into a new election package DB and returns
 * its path. `electionRow` overrides the stored election data or ballot hash
 * for tests that need values the package reader would reject or recompute.
 */
export async function createElectionPackageDbForTest(
  electionDefinition: ElectionDefinition,
  electionRow: Partial<
    Pick<ElectionDefinition, 'electionData' | 'ballotHash'>
  > = {}
): Promise<string> {
  const dbPath = join(
    mkdtempSync(join(tmpdir(), 'election-package-db-')),
    'election-package.db'
  );
  const store = ElectionPackageStore.fileStore(dbPath, {
    uiStrings: true,
    ballots: true,
    ballotPositions: true,
    candidateOrderings: true,
  });
  await importElectionPackageForTest(store, {
    electionDefinition,
    systemSettings: {
      ...DEFAULT_SYSTEM_SETTINGS,
      disableSystemLimitChecks: true,
    },
  });
  store.close();

  if (
    electionRow.electionData !== undefined ||
    electionRow.ballotHash !== undefined
  ) {
    chmodSync(dbPath, 0o644);
    const client = Client.fileClient(dbPath, new BaseLogger(LogSource.System));
    client.run(
      `update election set
        election_data = coalesce(?, election_data),
        ballot_hash = coalesce(?, ballot_hash)`,
      electionRow.electionData ?? null,
      electionRow.ballotHash ?? null
    );
    client.close();
  }
  return dbPath;
}
