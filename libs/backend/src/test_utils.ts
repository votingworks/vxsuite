import { Client } from '@votingworks/db';
import { BaseLogger, LogSource } from '@votingworks/logging';
import {
  DEFAULT_SYSTEM_SETTINGS,
  type ElectionDefinition,
} from '@votingworks/types';
import { mkdtempSync, writeFileSync } from 'node:fs';
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
    uiStrings,
  }: {
    jurisdiction?: string;
    electionPackageHash?: string;
    uiStrings?: boolean;
  } = {}
): Promise<string> {
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
    uiStrings,
  });
  return hash;
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
  const store = ElectionPackageStore.fileStore(dbPath);
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
