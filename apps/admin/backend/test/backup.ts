import { vi } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  makeTemporaryDirectory,
  readElectionGeneralDefinition,
} from '@votingworks/fixtures';
import { mockBaseLogger } from '@votingworks/logging';
import { zipFile } from '@votingworks/test-utils';
import {
  DEFAULT_SYSTEM_SETTINGS,
  ElectionPackageFileName,
  LATEST_METADATA,
} from '@votingworks/types';
import { createWorkspace, Workspace } from '../src/util/workspace.js';

/**
 * A stand-in for one of the ballot images a real workspace accumulates,
 * relative to the workspace root.
 */
export const BALLOT_IMAGE_PATH = 'ballot-images/election-1/cvr-1-front';

/**
 * The contents of the file at {@link BALLOT_IMAGE_PATH}.
 */
export const BALLOT_IMAGE_CONTENTS = 'ballot image bytes';

/**
 * Builds a workspace on disk with no election configured — a real workspace,
 * with a database, that simply has nothing in it yet.
 */
export function makeUnconfiguredWorkspace(): Workspace {
  return createWorkspace(
    makeTemporaryDirectory(),
    mockBaseLogger({ fn: vi.fn })
  );
}

/**
 * Builds a workspace on disk with an election configured, an election package,
 * a ballot image, and a machine mode file — i.e. the things a backup has to
 * carry.
 */
export async function makeConfiguredWorkspace(): Promise<Workspace> {
  const electionDefinition = readElectionGeneralDefinition();
  const workspace = createWorkspace(
    makeTemporaryDirectory(),
    mockBaseLogger({ fn: vi.fn })
  );

  const electionPackage = await zipFile({
    [ElectionPackageFileName.ELECTION]: electionDefinition.electionData,
    [ElectionPackageFileName.METADATA]: JSON.stringify(LATEST_METADATA),
    [ElectionPackageFileName.SYSTEM_SETTINGS]: JSON.stringify(
      DEFAULT_SYSTEM_SETTINGS
    ),
    [ElectionPackageFileName.APP_STRINGS]: JSON.stringify({}),
  });
  const electionPackagePath = join(
    makeTemporaryDirectory(),
    'election-package.zip'
  );
  writeFileSync(electionPackagePath, electionPackage);
  const electionId = await workspace.store.addElection({
    electionData: electionDefinition.electionData,
    systemSettingsData: JSON.stringify(DEFAULT_SYSTEM_SETTINGS),
    electionPackageSourceFilePath: electionPackagePath,
    electionPackageHash: 'abcdef0123456789',
  });
  workspace.store.setCurrentElectionId(electionId);

  mkdirSync(join(workspace.path, 'ballot-images/election-1'), {
    recursive: true,
  });
  writeFileSync(join(workspace.path, BALLOT_IMAGE_PATH), BALLOT_IMAGE_CONTENTS);
  writeFileSync(join(workspace.path, 'machine_mode'), 'host');

  return workspace;
}
