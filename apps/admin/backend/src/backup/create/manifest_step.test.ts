import { expect, test, vi } from 'vitest';
import { join } from 'node:path';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import {
  electionFamousNames2021Fixtures,
  makeTemporaryDirectory,
} from '@votingworks/fixtures';
import { DEV_MACHINE_ID, LATEST_SOFTWARE_VERSION } from '@votingworks/types';
import { mockBaseLogger } from '@votingworks/logging';
import { ok } from '@votingworks/basics';
import {
  authenticateArtifactUsingSignatureFile,
  SIGNATURE_FILE_EXTENSION,
  VXADMIN_BACKUP_MANIFEST_FILE_NAME,
} from '@votingworks/auth';
import { DateTime } from 'luxon';
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

  await writeManifest({
    manifest,
    backup: backupPath,
    logger: mockBaseLogger({ fn: vi.fn }),
    onProgressEvent: (event) => progressEvents.push(event),
  });

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
    await authenticateArtifactUsingSignatureFile({
      type: 'vxadmin_backup',
      context: 'import',
      directoryPath: backupPath,
    })
  ).toEqual(ok());
});

test('the signature does not authenticate a tampered-with manifest', async () => {
  const backupPath = makeBackupDirectory();

  await writeManifest({
    manifest: makeManifest(),
    backup: backupPath,
    logger: mockBaseLogger({ fn: vi.fn }),
  });

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
