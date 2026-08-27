import { beforeEach, expect, test, vi } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { appendFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import {
  electionFamousNames2021Fixtures,
  makeTemporaryDirectory,
} from '@votingworks/fixtures';
import { assertDefined, err, iter, ok } from '@votingworks/basics';
import { LogEventId, mockBaseLogger } from '@votingworks/logging';
import {
  authenticateArtifactUsingSignatureFile,
  prepareSignatureFile,
  SIGNATURE_FILE_EXTENSION,
  VXADMIN_BACKUP_MANIFEST_FILE_NAME,
} from '@votingworks/auth';
import {
  DEV_MACHINE_ID,
  LATEST_SOFTWARE_VERSION,
  safeParseJson,
} from '@votingworks/types';
import { exists } from 'fs-extra';
import { syncFilesystem } from '@votingworks/fs';
import {
  addCvrWithBallotImage,
  makeBackup,
  makeConfiguredWorkspace,
  mockDiskSpace,
} from '../../../test/backup.js';
import {
  ADMIN_WORKSPACE_DATABASE_NAME,
  createWorkspace,
  openWorkspace,
} from '../../util/workspace.js';
import { createBackup } from '../create/index.js';
import { Backup } from '../backup.js';
import {
  BackupManifest,
  BACKUP_MANIFEST_VERSION,
  BackupManifestStruct,
  BackupManifestStructSchema,
} from '../backup_manifest.js';
import { restoreBackup, RESTORE_IN_PROGRESS_MARKER_FILENAME } from './index.js';
import { ProgressEvent } from '../progress.js';

vi.mock(
  import('@votingworks/backend'),
  async (importActual): Promise<typeof import('@votingworks/backend')> => {
    const actual = await importActual();
    return {
      ...actual,
      getDiskSpaceSummaries: vi.fn(),
    };
  }
);

vi.mock(
  import('@votingworks/fs'),
  async (importActual): Promise<typeof import('@votingworks/fs')> => {
    const actual = await importActual();
    return {
      ...actual,
      syncFilesystem: vi.fn(actual.syncFilesystem),
    };
  }
);

beforeEach(() => {
  mockDiskSpace();
});

/**
 * Creates an empty, unconfigured workspace to restore into, leaving nothing
 * holding its database open.
 */
function makeUnconfiguredWorkspacePath(): string {
  const path = makeTemporaryDirectory();
  using workspace = createWorkspace(path, mockBaseLogger({ fn: vi.fn }));
  expect(workspace.store.getCurrentElectionId()).toBeUndefined();
  return path;
}

/**
 * Creates a workspace configured with an election, a CVR, and a ballot image,
 * leaving nothing holding its database open.
 */
async function makeConfiguredWorkspacePath(): Promise<string> {
  using workspace = await makeConfiguredWorkspace();
  addCvrWithBallotImage(workspace, { ballotId: 'existing-ballot' });
  return workspace.path;
}

/**
 * Lists everything in a workspace, ignoring the database's sidecar files since
 * those come and go as the database is opened and closed.
 */
function listWorkspace(workspacePath: string): string[] {
  return readdirSync(workspacePath, { recursive: true })
    .map(String)
    .filter((name) => !name.startsWith(`${ADMIN_WORKSPACE_DATABASE_NAME}-`))
    .sort();
}

/**
 * Reads a backup's manifest, authenticating it as any reader must.
 */
async function readBackupManifest(backup: Backup): Promise<BackupManifest> {
  await using authenticatedBackup = (await backup.open()).unsafeUnwrap();
  return (await authenticatedBackup.readManifest()).unsafeUnwrap();
}

/**
 * Rewrites a backup's `manifest.json` as whatever `revise` returns, bypassing
 * the schema so that manifests restore has to reject can be built. Note that
 * this invalidates the backup's signature.
 */
async function rewriteManifest(
  backup: Backup,
  revise: (manifest: BackupManifestStruct) => BackupManifestStruct,
  { sign = true }: { sign?: boolean } = {}
): Promise<void> {
  const manifest = safeParseJson(
    await readFile(backup.manifestPath, 'utf-8'),
    BackupManifestStructSchema
  ).unsafeUnwrap();
  await writeManifestContents(
    backup,
    JSON.stringify(revise(manifest), null, 2),
    { sign }
  );
}

/**
 * Writes a backup's `manifest.json` verbatim, so that contents no schema would
 * produce can be built.
 *
 * Re-signed by default so that a test about some other kind of bad manifest
 * keeps testing that, rather than tripping the signature check first. Pass
 * `sign: false` to leave the signature stale on purpose.
 */
async function writeManifestContents(
  backup: Backup,
  contents: string,
  { sign = true }: { sign?: boolean } = {}
): Promise<void> {
  await writeFile(backup.manifestPath, contents, 'utf-8');

  if (sign) {
    const signatureFile = await prepareSignatureFile({
      type: 'vxadmin_backup',
      context: 'export',
      manifestFileContents: contents,
    });
    await writeFile(
      join(backup.path, signatureFile.fileName),
      signatureFile.fileContents
    );
  }
}

/**
 * Replaces one of a backup's files with the contents of `sourcePath`, keeping
 * the manifest's size and hash for it accurate so that the backup still passes
 * file verification. Note that this invalidates the backup's signature.
 */
async function replaceBackupFile(
  backup: Backup,
  manifestPath: string,
  sourcePath: string
): Promise<void> {
  const contents = await readFile(sourcePath);
  await writeFile(join(backup.path, manifestPath), contents);
  await rewriteManifest(backup, (manifest) => ({
    ...manifest,
    files: manifest.files.map((file) =>
      file.path === manifestPath
        ? {
            ...file,
            size: contents.byteLength,
            hash: createHash('sha256').update(contents).digest('hex'),
          }
        : file
    ),
  }));
}

test('restore copies the database, ballot images, and election packages', async () => {
  const logger = mockBaseLogger({ fn: vi.fn });
  using source = await makeConfiguredWorkspace();
  addCvrWithBallotImage(source, { ballotId: 'ballot-1' });
  addCvrWithBallotImage(source, { ballotId: 'ballot-2' });

  const electionId = source.store.getCurrentElectionId()!;
  const sourceBallotImagePaths = source.store
    .getAllBallotImagePaths(electionId)
    .sort();
  expect(sourceBallotImagePaths).toHaveLength(2);
  const sourceElectionPackagePath =
    source.store.getElectionPackageFilePath(electionId)!;

  const created = (
    await createBackup({
      workspace: source.path,
      target: makeTemporaryDirectory(),
      logger,
    })
  ).unsafeUnwrap();

  const workspacePath = makeUnconfiguredWorkspacePath();
  const events: ProgressEvent[] = [];
  expect(
    await restoreBackup({
      backup: created.path,
      workspace: workspacePath,
      logger,
      onProgressEvent: (event) => events.push(event),
    })
  ).toEqual(ok());

  // Progress walks through the phases in order, and the copy events account
  // for every file and byte the manifest promised.
  expect(events[0]).toEqual({ type: 'preparing' });
  expect(events.at(-2)).toEqual({ type: 'verifying' });
  expect(events.at(-1)).toEqual({ type: 'flushing_workspace' });
  const copyEvents = events.filter((event) => event.type === 'copy_files');
  const manifest = await readBackupManifest(new Backup(created.path));
  expect(copyEvents[0]).toMatchObject({ copiedCount: 0, copiedBytes: 0 });
  expect(copyEvents.at(-1)).toEqual({
    type: 'copy_files',
    copiedCount: manifest.files.length,
    totalCount: manifest.files.length,
    copiedBytes: iter(manifest.files).sum(({ size }) => size),
    totalBytes: iter(manifest.files).sum(({ size }) => size),
  });

  // Restoring replaces the machine's entire data state, so both the attempt
  // and its outcome belong in the audit log.
  expect(vi.mocked(logger.log)).toHaveBeenCalledWith(
    LogEventId.BackupRestoreInit,
    'system',
    expect.objectContaining({ message: expect.stringContaining(created.path) })
  );
  expect(vi.mocked(logger.log)).toHaveBeenCalledWith(
    LogEventId.BackupRestoreComplete,
    'system',
    expect.objectContaining({ disposition: 'success' })
  );

  using restored = openWorkspace(workspacePath, logger);

  // The database came across whole: same election, same current election, same
  // CVR data hanging off it.
  expect(restored.store.getCurrentElectionId()).toEqual(electionId);
  expect(restored.store.getElection(electionId)).toEqual(
    source.store.getElection(electionId)
  );

  // Ballot images land at the same workspace-relative paths, with the same
  // contents.
  const restoredBallotImagePaths = restored.store
    .getAllBallotImagePaths(electionId)
    .sort();
  expect(
    restoredBallotImagePaths.map((path) => relative(restored.path, path))
  ).toEqual(sourceBallotImagePaths.map((path) => relative(source.path, path)));
  for (const [index, restoredPath] of restoredBallotImagePaths.entries()) {
    expect(readFileSync(restoredPath)).toEqual(
      readFileSync(sourceBallotImagePaths[index]!)
    );
  }

  // As does the election package.
  const restoredElectionPackagePath =
    restored.store.getElectionPackageFilePath(electionId)!;
  expect(relative(restored.path, restoredElectionPackagePath)).toEqual(
    relative(source.path, sourceElectionPackagePath)
  );
  expect(readFileSync(restoredElectionPackagePath)).toEqual(
    readFileSync(sourceElectionPackagePath)
  );
});

test('restore recreates workspace directories the backup has no files in', async () => {
  const logger = mockBaseLogger({ fn: vi.fn });

  // A workspace that is configured but has no CVRs loaded holds an empty
  // `ballot-images` directory, which a backup — a manifest of files — cannot
  // record.
  using source = await makeConfiguredWorkspace();
  const created = (
    await createBackup({
      workspace: source.path,
      target: makeTemporaryDirectory(),
      logger,
    })
  ).unsafeUnwrap();

  const workspacePath = makeUnconfiguredWorkspacePath();
  expect(
    await restoreBackup({
      backup: created.path,
      workspace: workspacePath,
      logger,
    })
  ).toEqual(ok());

  using restored = openWorkspace(workspacePath, logger);
  expect(restored.store.getCurrentElectionId()).toEqual(
    source.store.getCurrentElectionId()
  );
});

test('restore resolves relative workspace and backup paths', async () => {
  const backup = await makeBackup();
  const workspacePath = makeUnconfiguredWorkspacePath();
  const logger = mockBaseLogger({ fn: vi.fn });

  expect(
    await restoreBackup({
      backup: relative(process.cwd(), backup.path),
      workspace: relative(process.cwd(), workspacePath),
      logger,
    })
  ).toEqual(ok());

  // The audit log records the resolved absolute path.
  expect(vi.mocked(logger.log)).toHaveBeenCalledWith(
    LogEventId.BackupRestoreInit,
    'system',
    expect.objectContaining({ message: expect.stringContaining(backup.path) })
  );
});

test('restore fails if there is no backup manifest', async () => {
  const backup = await makeBackup();
  await rm(backup.manifestPath);

  const workspacePath = makeUnconfiguredWorkspacePath();
  const result = await restoreBackup({
    backup: backup.path,
    workspace: workspacePath,
    logger: mockBaseLogger({ fn: vi.fn }),
  });

  // The CLI renders a failed restore as `Error: ${err().message}`, the same as
  // it does a failed create, so every error has to carry a message naming what
  // could not be read.
  expect(result.err()).toEqual({
    type: 'backup-read-failed',
    message: expect.stringContaining(backup.manifestPath),
  });

  // Vetting failed before the restore touched the workspace, so the workspace
  // keeps what it had.
  expect(listWorkspace(workspacePath)).toEqual([
    'ballot-images',
    ADMIN_WORKSPACE_DATABASE_NAME,
    'election-packages',
  ]);
});

test('restore fails if the backup manifest is not readable', async () => {
  const backup = await makeBackup();
  // Signed, so this gets past authentication and fails where a damaged-but-
  // genuine backup would.
  await writeManifestContents(backup, 'not a manifest');

  const workspacePath = makeUnconfiguredWorkspacePath();
  const result = await restoreBackup({
    backup: backup.path,
    workspace: workspacePath,
    logger: mockBaseLogger({ fn: vi.fn }),
  });

  expect(result.err()).toMatchObject({ type: 'backup-read-failed' });

  // Vetting failed before the restore touched the workspace, so the workspace
  // keeps what it had.
  expect(listWorkspace(workspacePath)).toEqual([
    'ballot-images',
    ADMIN_WORKSPACE_DATABASE_NAME,
    'election-packages',
  ]);
});

test('restore fails if the backup manifest version does not match', async () => {
  const backup = await makeBackup();
  const futureVersion = BACKUP_MANIFEST_VERSION + 1;
  await rewriteManifest(backup, (manifest) => ({
    ...manifest,
    version: futureVersion as typeof BACKUP_MANIFEST_VERSION,
  }));

  const workspacePath = makeUnconfiguredWorkspacePath();
  const result = await restoreBackup({
    backup: backup.path,
    workspace: workspacePath,
    logger: mockBaseLogger({ fn: vi.fn }),
  });

  // A version field exists to explain *why* a backup can't be read, so this
  // has to be distinguishable from a corrupt manifest. Matched loosely so the
  // error may carry the versions as fields too.
  expect(result.err()).toMatchObject({
    type: 'unsupported-backup-version',
    message: expect.stringContaining(
      `Expected backup version ${BACKUP_MANIFEST_VERSION}`
    ),
  });

  // Vetting failed before the restore touched the workspace, so the workspace
  // keeps what it had.
  expect(listWorkspace(workspacePath)).toEqual([
    'ballot-images',
    ADMIN_WORKSPACE_DATABASE_NAME,
    'election-packages',
  ]);
});

test('restore fails if the backup manifest software version does not match', async () => {
  const backup = await makeBackup();
  // The real predecessor release, i.e. a drive carried over from a machine
  // that was never upgraded.
  await rewriteManifest(backup, (manifest) => ({
    ...manifest,
    softwareVersion: 'v4.0',
  }));

  const workspacePath = makeUnconfiguredWorkspacePath();
  const result = await restoreBackup({
    backup: backup.path,
    workspace: workspacePath,
    logger: mockBaseLogger({ fn: vi.fn }),
  });

  expect(result.err()).toMatchObject({
    type: 'unsupported-software-version',
    message: expect.stringContaining(
      `Expected software version ${LATEST_SOFTWARE_VERSION}`
    ),
  });

  // Vetting failed before the restore touched the workspace, so the workspace
  // keeps what it had.
  expect(listWorkspace(workspacePath)).toEqual([
    'ballot-images',
    ADMIN_WORKSPACE_DATABASE_NAME,
    'election-packages',
  ]);
});

test('restore warns but does not fail if the machine ID does not match', async () => {
  const backup = await makeBackup();
  const otherMachineId = 'VX-00-999';
  await rewriteManifest(backup, (manifest) => ({
    ...manifest,
    machineId: otherMachineId,
  }));

  const workspacePath = makeUnconfiguredWorkspacePath();
  const logger = mockBaseLogger({ fn: vi.fn });
  const result = await restoreBackup({
    backup: backup.path,
    workspace: workspacePath,
    logger,
  });

  // Moving a backup between machines is a legitimate thing to do — replacing
  // failed hardware — so this is worth recording, not refusing.
  expect(result).toEqual(ok());
  using workspace = openWorkspace(workspacePath, mockBaseLogger({ fn: vi.fn }));
  expect(workspace.store.getCurrentElectionId()).toBeDefined();

  // The event id is left to the implementation, but the log has to say which
  // machine made the backup and which one is reading it, or it can't be told
  // apart from a restore onto the machine that made it.
  const warnings = vi
    .mocked(logger.log)
    .mock.calls.filter((call) => JSON.stringify(call).includes(otherMachineId));
  expect(warnings).toHaveLength(1);
  expect(JSON.stringify(warnings[0])).toContain(DEV_MACHINE_ID);
});

test.each<{ description: string; tamper: (backup: Backup) => Promise<void> }>([
  {
    description: 'signature does not match the manifest',
    // A change restore would otherwise accept, so that only the signature
    // check can be what rejects this backup.
    tamper: (backup) =>
      rewriteManifest(
        backup,
        (manifest) => ({ ...manifest, machineId: 'VX-00-999' }),
        { sign: false }
      ),
  },
  {
    description: 'signature is missing entirely',
    tamper: (backup) =>
      rm(
        join(
          backup.path,
          `${VXADMIN_BACKUP_MANIFEST_FILE_NAME}${SIGNATURE_FILE_EXTENSION}`
        )
      ),
  },
])('restore fails if the backup $description', async ({ tamper }) => {
  const backup = await makeBackup();
  // Proves the tampering below is what breaks authentication, not the fixture.
  expect(
    await authenticateArtifactUsingSignatureFile({
      type: 'vxadmin_backup',
      context: 'import',
      directoryPath: backup.path,
    })
  ).toEqual(ok());

  await tamper(backup);

  const workspacePath = makeUnconfiguredWorkspacePath();
  const result = await restoreBackup({
    backup: backup.path,
    workspace: workspacePath,
    logger: mockBaseLogger({ fn: vi.fn }),
  });

  // Every hash in the manifest is only as trustworthy as the manifest itself,
  // so an unauthenticated manifest makes the whole backup unverifiable. This is
  // its own failure: the backup is well-formed and internally consistent, it
  // just did not come from a machine this one trusts.
  expect(result.err()).toMatchObject({
    type: 'backup-authentication-failed',
  });

  // Vetting failed before the restore touched the workspace, so the workspace
  // keeps what it had.
  expect(listWorkspace(workspacePath)).toEqual([
    'ballot-images',
    ADMIN_WORKSPACE_DATABASE_NAME,
    'election-packages',
  ]);
});

test('restore fails if a backup file cannot be read', async () => {
  const backup = await makeBackup();
  const manifest = await readBackupManifest(backup);
  const unreadableFile = assertDefined(manifest.files.at(-1));
  const unreadablePath = join(backup.path, unreadableFile.path);
  // A directory in place of the file reads as EISDIR, standing in for the
  // whole class of errors a dying USB drive raises mid-copy — EIO, EACCES —
  // which, unlike ENOENT, say nothing about whether the backup is intact.
  await rm(unreadablePath);
  await mkdir(unreadablePath);

  const workspacePath = makeUnconfiguredWorkspacePath();
  const result = await restoreBackup({
    backup: backup.path,
    workspace: workspacePath,
    logger: mockBaseLogger({ fn: vi.fn }),
  });

  // Any failure to copy has to be reported. Reporting success here hands the
  // operator a workspace missing a file they will not learn about until
  // something later needs it.
  // The error type is left open: this is a broken drive, not a claim about
  // whether the backup itself is valid.
  expect(result.err()).toMatchObject({
    message: expect.stringContaining(unreadableFile.path),
  });

  await expect(
    exists(join(workspacePath, ADMIN_WORKSPACE_DATABASE_NAME))
  ).resolves.toBeFalsy();
});

test('restore fails on missing files from the backup manifest', async () => {
  const backup = await makeBackup();
  const manifest = await readBackupManifest(backup);
  // The last file, so that an implementation copying as it walks the manifest
  // would already have written everything else by the time it noticed.
  const missingFile = assertDefined(manifest.files.at(-1));
  await rm(join(backup.path, missingFile.path));

  const workspacePath = makeUnconfiguredWorkspacePath();
  const result = await restoreBackup({
    backup: backup.path,
    workspace: workspacePath,
    logger: mockBaseLogger({ fn: vi.fn }),
  });

  expect(result.err()).toMatchObject({
    type: 'backup-verification-failed',
    message: expect.stringContaining(missingFile.path),
  });

  await expect(
    exists(join(workspacePath, ADMIN_WORKSPACE_DATABASE_NAME))
  ).resolves.toBeFalsy();
});

test('restore fails if any backup files are an unexpected size', async () => {
  const backup = await makeBackup();
  const manifest = await readBackupManifest(backup);
  const grownFile = assertDefined(manifest.files.at(-1));
  // Grown rather than truncated: a copy that reads only the number of bytes the
  // manifest promises would silently succeed on this and drop the difference.
  await appendFile(join(backup.path, grownFile.path), 'extra');

  const workspacePath = makeUnconfiguredWorkspacePath();
  const result = await restoreBackup({
    backup: backup.path,
    workspace: workspacePath,
    logger: mockBaseLogger({ fn: vi.fn }),
  });

  // The file is present and readable, so existence is not enough — the size the
  // manifest records has to be checked against the file on disk.
  expect(result.err()).toMatchObject({
    type: 'backup-verification-failed',
    message: expect.stringContaining(grownFile.path),
  });

  await expect(
    exists(join(workspacePath, ADMIN_WORKSPACE_DATABASE_NAME))
  ).resolves.toBeFalsy();
});

test('restore fails if any backup files have unexpected content (by hash)', async () => {
  const backup = await makeBackup();
  const manifest = await readBackupManifest(backup);
  const editedFile = assertDefined(manifest.files.at(-1));
  const editedFilePath = join(backup.path, editedFile.path);
  const contents = await readFile(editedFilePath);
  expect(contents).not.toHaveLength(0);
  // Edited in place so the file is exactly as long as the manifest says it is:
  // corruption on a USB drive rewrites bytes, it does not change file lengths.
  // eslint-disable-next-line no-bitwise
  contents[0]! ^= 0xff;
  await writeFile(editedFilePath, contents);

  const workspacePath = makeUnconfiguredWorkspacePath();
  const result = await restoreBackup({
    backup: backup.path,
    workspace: workspacePath,
    logger: mockBaseLogger({ fn: vi.fn }),
  });

  expect(result.err()).toMatchObject({
    type: 'backup-verification-failed',
    message: expect.stringContaining(editedFile.path),
  });

  await expect(
    exists(join(workspacePath, ADMIN_WORKSPACE_DATABASE_NAME))
  ).resolves.toBeFalsy();
});

test.each<{ description: string; makePath: (escapeTarget: string) => string }>([
  {
    description: 'absolute',
    makePath: (escapeTarget) => escapeTarget,
  },
  {
    description: 'backup root-escaping',
    // Kept under `workspace/` so that stripping that prefix, as a restore must,
    // still leaves a path that climbs out of the workspace.
    makePath: (escapeTarget) =>
      join('workspace', relative(join('/backup', 'workspace'), escapeTarget)),
  },
])(
  'restore fails if any backup files have $description paths',
  async ({ makePath }) => {
    const backup = await makeBackup();
    const escapeTarget = join(makeTemporaryDirectory(), 'escaped-file');
    await rewriteManifest(backup, (manifest) => ({
      ...manifest,
      files: [
        {
          path: makePath(escapeTarget),
          hash: 'a'.repeat(64),
          size: 0,
        },
      ],
    }));

    const workspacePath = makeUnconfiguredWorkspacePath();
    const result = await restoreBackup({
      backup: backup.path,
      workspace: workspacePath,
      logger: mockBaseLogger({ fn: vi.fn }),
    });

    // A backup comes off a USB drive an operator was handed, so its manifest is
    // untrusted input: a path in it must never be able to name a file outside
    // the workspace being restored into. The manifest schema is what refuses
    // these today, which is why they read as unreadable rather than as their
    // own error type.
    expect(result.err()).toMatchObject({ type: 'backup-read-failed' });

    await expect(exists(escapeTarget)).resolves.toBeFalsy();
    // Vetting failed before the restore touched the workspace, so the
    // workspace keeps what it had.
    expect(listWorkspace(workspacePath)).toEqual([
      'ballot-images',
      ADMIN_WORKSPACE_DATABASE_NAME,
      'election-packages',
    ]);
  }
);

test('restore refuses a manifest entry it does not know how to restore', async () => {
  const backup = await makeBackup();
  await rewriteManifest(backup, (manifest) => ({
    ...manifest,
    files: [
      ...manifest.files,
      { path: 'extras/from-the-future.db', hash: 'a'.repeat(64), size: 0 },
    ],
  }));

  const workspacePath = makeUnconfiguredWorkspacePath();
  const result = await restoreBackup({
    backup: backup.path,
    workspace: workspacePath,
    logger: mockBaseLogger({ fn: vi.fn }),
  });

  // The manifest is the signed statement of what the backup holds, so an entry
  // this software cannot restore means the backup cannot be reproduced
  // faithfully. Skipping it silently would report success while dropping data.
  expect(result.err()).toMatchObject({
    type: 'backup-verification-failed',
    message: expect.stringContaining('extras/from-the-future.db'),
  });

  // Vetting failed before the restore touched the workspace, so the workspace
  // keeps what it had.
  expect(listWorkspace(workspacePath)).toEqual([
    'ballot-images',
    ADMIN_WORKSPACE_DATABASE_NAME,
    'election-packages',
  ]);
});

test('restore fails if there is no current election in the backup', async () => {
  const backup = await makeBackup();
  // The manifest still promises the election it was made from, so this is a
  // backup whose files verify but whose database does not hold what the
  // manifest says it does.
  await replaceBackupFile(
    backup,
    join('workspace', ADMIN_WORKSPACE_DATABASE_NAME),
    join(makeUnconfiguredWorkspacePath(), ADMIN_WORKSPACE_DATABASE_NAME)
  );

  const workspacePath = makeUnconfiguredWorkspacePath();
  const result = await restoreBackup({
    backup: backup.path,
    workspace: workspacePath,
    logger: mockBaseLogger({ fn: vi.fn }),
  });

  // Restoring this would report success and leave the machine unconfigured,
  // which reads to an operator as the election having been lost, so it has to
  // fail naming the election the operator was told they were restoring.
  expect(result.err()).toMatchObject({
    type: 'backup-verification-failed',
    message: expect.stringContaining(
      electionFamousNames2021Fixtures.readElectionDefinition().election.id
    ),
  });

  await expect(
    exists(join(workspacePath, ADMIN_WORKSPACE_DATABASE_NAME))
  ).resolves.toBeFalsy();
});

test('restore clears whatever an unconfigured workspace already holds', async () => {
  const backup = await makeBackup();
  const workspacePath = makeUnconfiguredWorkspacePath();
  await mkdir(join(workspacePath, 'stray-directory'));
  await writeFile(
    join(workspacePath, 'stray-directory', 'stray-file'),
    'left over from before'
  );

  const events: ProgressEvent[] = [];
  expect(
    await restoreBackup({
      backup: backup.path,
      workspace: workspacePath,
      logger: mockBaseLogger({ fn: vi.fn }),
      onProgressEvent: (event) => events.push(event),
      // Low enough that even these small files report mid-copy progress.
      progressEventIntervalBytes: 1,
    })
  ).toEqual(ok());

  // A file bigger than the reporting interval emits progress while it is still
  // copying, named as the current file.
  expect(
    events.some(
      (event) =>
        event.type === 'copy_files' &&
        event.current !== undefined &&
        event.copiedBytes > 0 &&
        event.copiedCount < event.totalCount
    )
  ).toEqual(true);

  // The workspace has to end up holding exactly what the backup provided:
  // anything already there would otherwise merge into the restored state.
  await expect(
    exists(join(workspacePath, 'stray-directory'))
  ).resolves.toBeFalsy();
  using workspace = openWorkspace(workspacePath, mockBaseLogger({ fn: vi.fn }));
  expect(workspace.store.getCurrentElectionId()).toBeDefined();
});

test('an interrupted restore can be recovered by restoring again', async () => {
  const backup = await makeBackup();
  const workspacePath = makeUnconfiguredWorkspacePath();
  expect(
    await restoreBackup({
      backup: backup.path,
      workspace: workspacePath,
      logger: mockBaseLogger({ fn: vi.fn }),
    })
  ).toEqual(ok());

  // Simulate a crash after the database was copied but before the restore
  // finished: the workspace looks configured, but the marker is still there.
  const markerPath = join(workspacePath, RESTORE_IN_PROGRESS_MARKER_FILENAME);
  await writeFile(markerPath, '');

  // The configured election is half-restored debris, not data to protect, so
  // this must restore rather than refuse — refusing would leave the operator
  // with no way forward.
  expect(
    await restoreBackup({
      backup: backup.path,
      workspace: workspacePath,
      logger: mockBaseLogger({ fn: vi.fn }),
    })
  ).toEqual(ok());

  await expect(exists(markerPath)).resolves.toBeFalsy();
  using workspace = openWorkspace(workspacePath, mockBaseLogger({ fn: vi.fn }));
  expect(workspace.store.getCurrentElectionId()).toBeDefined();
});

test('restore refuses a backup the workspace volume cannot hold', async () => {
  const backup = await makeBackup();
  const workspacePath = makeUnconfiguredWorkspacePath();
  mockDiskSpace(() => 1);

  const result = await restoreBackup({
    backup: backup.path,
    workspace: workspacePath,
    logger: mockBaseLogger({ fn: vi.fn }),
    minAvailableStorageBytes: 1024,
  });

  expect(result.err()).toMatchObject({
    type: 'insufficient-workspace-storage',
    available: 1024,
  });

  // Refused before anything was written, so the workspace keeps what it had.
  expect(listWorkspace(workspacePath)).toEqual([
    'ballot-images',
    ADMIN_WORKSPACE_DATABASE_NAME,
    'election-packages',
  ]);
});

test('restore fails if the restored files cannot be flushed to disk', async () => {
  const backup = await makeBackup();
  const workspacePath = makeUnconfiguredWorkspacePath();
  vi.mocked(syncFilesystem).mockResolvedValueOnce(
    err({ code: 'EIO', message: 'EIO: the device rejected the data' })
  );

  const result = await restoreBackup({
    backup: backup.path,
    workspace: workspacePath,
    logger: mockBaseLogger({ fn: vi.fn }),
  });

  // Success is declared by removing the marker, which must not happen while
  // the restored files live only in the page cache.
  expect(result.err()).toMatchObject({
    type: 'workspace-flush-failed',
    message: expect.stringContaining('EIO'),
  });
  expect(listWorkspace(workspacePath)).toEqual([]);
});

test('restoring into a configured workspace fails', async () => {
  const backup = await makeBackup();
  const workspacePath = await makeConfiguredWorkspacePath();

  const before = listWorkspace(workspacePath);
  const logger = mockBaseLogger({ fn: vi.fn });
  const result = await restoreBackup({
    backup: backup.path,
    workspace: workspacePath,
    logger,
  });

  expect(result.err()).toMatchObject({ type: 'workspace-already-configured' });

  // A refused restore is still a restore that was attempted, so the failure
  // and its reason belong in the audit log.
  expect(vi.mocked(logger.log)).toHaveBeenCalledWith(
    LogEventId.BackupRestoreComplete,
    'system',
    expect.objectContaining({
      disposition: 'failure',
      errorType: 'workspace-already-configured',
    })
  );

  // The refusal has to happen before anything is written or cleaned up: a
  // restore that wipes the election already on the machine and then reports
  // failure has destroyed the very data it declined to replace.
  expect(listWorkspace(workspacePath)).toEqual(before);
  using workspace = openWorkspace(workspacePath, mockBaseLogger({ fn: vi.fn }));
  const electionId = assertDefined(workspace.store.getCurrentElectionId());
  expect(workspace.store.getAllBallotImagePaths(electionId)).toHaveLength(1);
});
