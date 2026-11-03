import { BaseLogger, LogSource } from '@votingworks/logging';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readElectionPackageFromFile } from './election_package/election_package_io.js';
import type { ElectionPackageStore } from './election_package/store.js';
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
