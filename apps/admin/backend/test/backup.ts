import { vi } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  makeTemporaryDirectory,
  readElectionGeneralDefinition,
} from '@votingworks/fixtures';
import {
  LogEventId,
  mockBaseLogger,
  MockBaseLogger,
} from '@votingworks/logging';
import { zipFile } from '@votingworks/test-utils';
import {
  DEFAULT_SYSTEM_SETTINGS,
  ElectionPackageFileName,
  LATEST_METADATA,
} from '@votingworks/types';
import { assert } from '@votingworks/basics';
import { getDiskSpaceSummary } from '@votingworks/backend';
import { syncFilesystem } from '@votingworks/usb-drive';
import { generateElectionBasedSubfolderName } from '@votingworks/utils';
import { BackupStep, createBackup } from '../src/backup/create_backup.js';
import { BackupManifest } from '../src/backup/manifest.js';
import { MachineConfig } from '../src/types.js';
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

/**
 * The machine a backup fixture claims to have been made on.
 */
export const MACHINE_CONFIG: MachineConfig = {
  machineId: 'AD-1234',
  codeVersion: '1.2.3',
};

/**
 * A logger whose calls a test can inspect.
 */
export function mockLogger(): MockBaseLogger {
  return mockBaseLogger({ fn: vi.fn });
}

/**
 * The stages a run reported, in order, from what it logged.
 */
export function loggedSteps(log: MockBaseLogger): BackupStep[] {
  return vi
    .mocked(log.log)
    .mock.calls.filter(
      ([eventId]) => eventId === LogEventId.BackupCreateProgress
    )
    .map(([, , logData]) => (logData as { step: BackupStep }).step);
}

/**
 * The directory name a backup of the fixture election takes on a drive.
 */
export function expectedBackupDirectoryName(): string {
  const electionDefinition = readElectionGeneralDefinition();
  return generateElectionBasedSubfolderName(
    electionDefinition.election,
    electionDefinition.ballotHash
  );
}

/**
 * Puts a backup on a drive for tests that are about reading one back rather
 * than writing one.
 */
export async function createValidBackup(): Promise<{
  backupDirectoryPath: string;
  manifest: BackupManifest;
}> {
  const workspace = await makeConfiguredWorkspace();
  const result = await createBackup({
    workspace,
    targetDirectoryPath: makeTemporaryDirectory(),
    machineConfig: MACHINE_CONFIG,
    logger: mockLogger(),
  });
  return result.unsafeUnwrap();
}

/**
 * Gives every disk a terabyte free and makes flushing succeed, so a test only
 * has to say what it wants to go wrong.
 *
 * The caller must have mocked `@votingworks/backend` and
 * `@votingworks/usb-drive` — `vi.mock` is per-file and cannot be moved here.
 */
export function mockRoomToWorkIn(): void {
  assert(
    vi.isMockFunction(getDiskSpaceSummary) && vi.isMockFunction(syncFilesystem),
    "mockRoomToWorkIn needs the calling test file to vi.mock '@votingworks/backend' " +
      "and '@votingworks/usb-drive'"
  );
  // 1 TB free everywhere, in the 1K blocks `df` reports.
  vi.mocked(getDiskSpaceSummary).mockResolvedValue({
    total: 1_000_000_000,
    used: 0,
    available: 1_000_000_000,
  });
  vi.mocked(syncFilesystem).mockResolvedValue();
}
