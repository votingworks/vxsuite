import { expect, test, vi } from 'vitest';
import { join } from 'node:path';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import {
  electionFamousNames2021Fixtures,
  makeTemporaryDirectory,
} from '@votingworks/fixtures';
import { DEV_MACHINE_ID, LATEST_SOFTWARE_VERSION } from '@votingworks/types';
import { mockLogger } from '@votingworks/logging';
import {
  authenticateArtifactUsingSignatureFile,
  SIGNATURE_FILE_EXTENSION,
  VXADMIN_BACKUP_MANIFEST_FILE_NAME,
} from '@votingworks/auth';
import { DateTime } from 'luxon';
import { err, typedAs } from '@votingworks/basics';
import { WriteFileError } from '@votingworks/fs';
import {
  BackupManifest,
  BackupManifestStructSchema,
} from '../backup_manifest.js';
import { writeManifest } from './manifest_step.js';
import { ProgressEvent } from '../progress.js';

function makeManifest(): BackupManifest {
  const { election } = electionFamousNames2021Fixtures.readElectionDefinition();
  return new BackupManifest(
    LATEST_SOFTWARE_VERSION,
    DEV_MACHINE_ID,
    DateTime.now().toISO(),
    { id: election.id, title: election.title, date: election.date },
    [
      {
        path: 'workspace/data.db',
        size: 3,
        hash: 'a'.repeat(64),
      },
    ]
  );
}

function makeBackupDirectory(): string {
  const backupPath = join(makeTemporaryDirectory(), 'backup');
  mkdirSync(backupPath);
  return backupPath;
}

test('writes a manifest alongside a signature that authenticates it', async () => {
  const backupPath = makeBackupDirectory();
  const manifest = makeManifest();
  const progressEvents: ProgressEvent[] = [];

  (
    await writeManifest({
      manifest,
      backup: backupPath,
      logger: mockLogger({ fn: vi.fn, role: 'system_administrator' }),
      onProgressEvent: (event) => progressEvents.push(event),
    })
  ).unsafeUnwrap();

  expect(progressEvents).toEqual([{ type: 'writing_manifest' }]);

  const manifestPath = join(backupPath, VXADMIN_BACKUP_MANIFEST_FILE_NAME);
  expect(
    BackupManifestStructSchema.parse(
      JSON.parse(readFileSync(manifestPath, 'utf-8'))
    )
  ).toEqual(manifest.toJSON());

  // The signature file sits inside the backup, next to the manifest it signs.
  expect(
    readFileSync(`${manifestPath}${SIGNATURE_FILE_EXTENSION}`).length
  ).toBeGreaterThan(0);

  expect(
    (
      await authenticateArtifactUsingSignatureFile({
        type: 'vxadmin_backup',
        context: 'import',
        directoryPath: backupPath,
      })
    ).err()
  ).toBeUndefined();
});

test('the signature does not authenticate a tampered-with manifest', async () => {
  const backupPath = makeBackupDirectory();

  (
    await writeManifest({
      manifest: makeManifest(),
      backup: backupPath,
      logger: mockLogger({ fn: vi.fn, role: 'system_administrator' }),
    })
  ).unsafeUnwrap();

  const manifestPath = join(backupPath, VXADMIN_BACKUP_MANIFEST_FILE_NAME);
  const manifest = BackupManifestStructSchema.parse(
    JSON.parse(readFileSync(manifestPath, 'utf-8'))
  );
  writeFileSync(
    manifestPath,
    JSON.stringify({ ...manifest, machineId: 'not-the-signing-machine' })
  );

  const authenticateResult = await authenticateArtifactUsingSignatureFile({
    type: 'vxadmin_backup',
    context: 'import',
    directoryPath: backupPath,
  });
  expect(authenticateResult.err()?.message).toMatch(
    /^Error authenticating .* using signature file:/
  );
});

// A backup is written to removable media, so what sits at a path we mean to
// write is chosen by whoever handed us the drive. `/dev/null` stands in for
// anything a drive could hold there that opens for writing but swallows what
// is written to it.
test.runIf(existsSync('/dev/null')).each([
  { what: 'the manifest', fileName: VXADMIN_BACKUP_MANIFEST_FILE_NAME },
  {
    what: 'the signature',
    fileName: `${VXADMIN_BACKUP_MANIFEST_FILE_NAME}${SIGNATURE_FILE_EXTENSION}`,
  },
])(
  'refuses to write $what to something that is not a regular file',
  async ({ fileName }) => {
    const backupPath = makeBackupDirectory();
    symlinkSync('/dev/null', join(backupPath, fileName));

    expect(
      await writeManifest({
        manifest: makeManifest(),
        backup: backupPath,
        logger: mockLogger({ fn: vi.fn, role: 'system_administrator' }),
      })
    ).toEqual(err(typedAs<WriteFileError>({ type: 'NotRegularFile' })));
  }
);
