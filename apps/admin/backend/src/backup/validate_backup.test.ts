// Checking a backup on a drive against its signed manifest.

import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { cpSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { open as realOpen } from 'node:fs/promises';
import { join } from 'node:path';
import { prepareSignatureFile } from '@votingworks/auth';
import { assertDefined, err, iter } from '@votingworks/basics';
import { makeTemporaryDirectory } from '@votingworks/fixtures';
import { open } from './fs.js';
import {
  backupFilePath,
  BackupManifest,
  manifestPath,
  readManifest,
  WORKSPACE_DIRECTORY_NAME,
} from './manifest.js';
import {
  BackupValidationError,
  BackupValidationProgress,
  formatBackupValidationError,
  validateBackup,
} from './validate_backup.js';
import {
  BALLOT_IMAGE_PATH,
  createValidBackup,
  mockRoomToWorkIn,
} from '../../test/backup.js';

// Validation's filesystem calls go through `./fs.js` so that one of them can be
// made to fail here. Each one calls through to the real implementation unless a
// test says otherwise.
vi.mock('./fs.js', async (importActual) => {
  const actual = await importActual<typeof import('./fs.js')>();
  return { ...actual, open: vi.fn(actual.open) };
});

vi.mock(
  '@votingworks/backend',
  async (importActual): Promise<typeof import('@votingworks/backend')> => ({
    ...(await importActual<typeof import('@votingworks/backend')>()),
    getDiskSpaceSummary: vi.fn(),
  })
);

vi.mock(
  '@votingworks/usb-drive',
  async (importActual): Promise<typeof import('@votingworks/usb-drive')> => ({
    ...(await importActual<typeof import('@votingworks/usb-drive')>()),
    syncFilesystem: vi.fn(),
  })
);

afterEach(() => {
  // Whatever a test made `open` do, put it back to doing the real thing.
  vi.mocked(open).mockImplementation(realOpen);
});

beforeEach(() => {
  mockRoomToWorkIn();
});

test('validation reports progress as it verifies each file', async () => {
  const { backupDirectoryPath, manifest } = await createValidBackup();
  const bytesTotal = iter(manifest.files).sum(({ size }) => size);
  const updates: BackupValidationProgress[] = [];

  const result = await validateBackup({
    backupDirectoryPath,
    onProgress: (progress) => updates.push(progress),
  });
  result.unsafeUnwrap();

  // One update before any file is read, so a caller can show the total up
  // front, then one per file verified.
  expect(updates).toHaveLength(manifest.files.length + 1);
  expect(updates[0]).toEqual({ bytesCompleted: 0, bytesTotal });
  expect(updates[updates.length - 1]).toEqual({
    bytesCompleted: bytesTotal,
    bytesTotal,
  });
});

test('validation rejects a backup whose manifest cannot be read', async () => {
  const { backupDirectoryPath } = await createValidBackup();
  rmSync(manifestPath(backupDirectoryPath));

  const result = await validateBackup({ backupDirectoryPath });
  expect(result).toEqual(
    err({
      type: 'manifest_unreadable',
      message: expect.stringContaining('ENOENT'),
    })
  );
});

test('validation rejects a manifest that has been edited', async () => {
  const { backupDirectoryPath, manifest } = await createValidBackup();
  writeFileSync(
    manifestPath(backupDirectoryPath),
    JSON.stringify({ ...manifest, machineId: 'AD-9999' })
  );

  const result = await validateBackup({ backupDirectoryPath });
  expect(result).toEqual(
    err({
      type: 'signature_invalid',
      message: expect.stringContaining('Verification failure'),
    })
  );
});

test('validation rejects a manifest format it does not understand', async () => {
  const { backupDirectoryPath, manifest } = await createValidBackup();

  // Signed, as a manifest written by later software would be: the point is
  // that a backup can be perfectly authentic and still be unreadable here.
  const manifestFileContents = JSON.stringify({ ...manifest, version: 2 });
  writeFileSync(manifestPath(backupDirectoryPath), manifestFileContents);
  const signatureFile = await prepareSignatureFile({
    type: 'vxadmin_backup',
    context: 'export',
    manifestFileContents,
  });
  writeFileSync(
    join(backupDirectoryPath, signatureFile.fileName),
    signatureFile.fileContents
  );

  const result = await validateBackup({ backupDirectoryPath });

  // Not a signature failure: this is about a backup we cannot claim to have
  // checked, even if it were signed.
  expect(result.err()).toEqual(
    expect.objectContaining({
      type: 'manifest_version_unsupported',
      version: 2,
    })
  );
});

test('validation rejects a backup made by different software', async () => {
  const { backupDirectoryPath } = await createValidBackup();

  const result = await validateBackup({
    backupDirectoryPath,
    expectedSoftwareVersion: '9.9.9',
  });
  expect(result).toEqual(
    err({
      type: 'software_version_mismatch',
      expectedSoftwareVersion: '9.9.9',
      actualSoftwareVersion: '1.2.3',
    })
  );
});

test('validation rejects a backup with a missing file', async () => {
  const { backupDirectoryPath } = await createValidBackup();
  rmSync(backupFilePath(backupDirectoryPath, BALLOT_IMAGE_PATH));

  const result = await validateBackup({ backupDirectoryPath });
  expect(result).toEqual(
    err({
      type: 'file_missing',
      path: BALLOT_IMAGE_PATH,
    })
  );
});

test('validation rejects a symlink standing in for a file the manifest lists', async () => {
  const { backupDirectoryPath } = await createValidBackup();
  const listedPath = backupFilePath(backupDirectoryPath, BALLOT_IMAGE_PATH);
  const target = join(makeTemporaryDirectory(), 'somewhere-else');
  writeFileSync(target, 'bytes from outside the backup');
  rmSync(listedPath);
  symlinkSync(target, listedPath);

  // Reading through the link would hash whatever it points at, and a drive that
  // repoints it later would have the backup reading a different file than the
  // one validation approved.
  const result = await validateBackup({ backupDirectoryPath });
  expect(result).toEqual(
    err({
      type: 'file_not_regular',
      path: BALLOT_IMAGE_PATH,
    })
  );
});

test('validation lets an unexpected read failure through', async () => {
  const { backupDirectoryPath } = await createValidBackup();
  vi.mocked(open).mockRejectedValueOnce(
    Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' })
  );

  // A file the machine cannot open at all is not a finding about the backup, so
  // it travels up as a failure of validation rather than becoming one of the
  // reasons a backup is invalid.
  await expect(validateBackup({ backupDirectoryPath })).rejects.toThrow(
    'EACCES'
  );
});

test('validation rejects a symlink the manifest does not list', async () => {
  const { backupDirectoryPath } = await createValidBackup();
  symlinkSync('/etc/hostname', join(backupDirectoryPath, 'sneaky'));

  const result = await validateBackup({ backupDirectoryPath });
  expect(result).toEqual(
    err({
      type: 'unexpected_file',
      path: 'sneaky',
    })
  );
});

test('validation rejects a symlinked directory holding the files the manifest lists', async () => {
  const { backupDirectoryPath } = await createValidBackup();
  const imagesDirectory = backupFilePath(
    backupDirectoryPath,
    assertDefined(BALLOT_IMAGE_PATH.split('/')[0])
  );
  const elsewhere = join(makeTemporaryDirectory(), 'ballot-images');
  cpSync(imagesDirectory, elsewhere, { recursive: true });
  rmSync(imagesDirectory, { recursive: true });
  symlinkSync(elsewhere, imagesDirectory);

  // `O_NOFOLLOW` does not stop a read through a symlinked parent, and the files
  // it leads to hash correctly, so the link itself is what has to be caught.
  const result = await validateBackup({ backupDirectoryPath });
  expect(result).toEqual(
    err({
      type: 'unexpected_file',
      path: `${WORKSPACE_DIRECTORY_NAME}/ballot-images`,
    })
  );
});

test('validation rejects a backup with a resized file', async () => {
  const { backupDirectoryPath, manifest } = await createValidBackup();
  const file = assertDefined(
    manifest.files.find((f) => f.path === BALLOT_IMAGE_PATH)
  );
  writeFileSync(
    backupFilePath(backupDirectoryPath, BALLOT_IMAGE_PATH),
    'short'
  );

  const result = await validateBackup({ backupDirectoryPath });
  expect(result).toEqual(
    err({
      type: 'file_size_mismatch',
      path: BALLOT_IMAGE_PATH,
      expectedSize: file.size,
      actualSize: 5,
    })
  );
});

test('validation rejects a backup with an altered file', async () => {
  const { backupDirectoryPath } = await createValidBackup();
  writeFileSync(
    backupFilePath(backupDirectoryPath, BALLOT_IMAGE_PATH),
    'ballot image bytez'
  );

  const result = await validateBackup({ backupDirectoryPath });
  expect(result).toEqual(
    err({
      type: 'file_hash_mismatch',
      path: BALLOT_IMAGE_PATH,
      expectedSha256: expect.any(String),
      actualSha256: expect.any(String),
    })
  );
});

test('validation rejects a backup with a file the manifest does not list', async () => {
  const { backupDirectoryPath } = await createValidBackup();
  writeFileSync(join(backupDirectoryPath, 'surprise.txt'), 'hello');

  const result = await validateBackup({ backupDirectoryPath });
  expect(result).toEqual(
    err({
      type: 'unexpected_file',
      path: 'surprise.txt',
    })
  );
});

test('validation rejects a manifest path that climbs out of the backup', async () => {
  const { backupDirectoryPath, manifest } = await createValidBackup();
  const escaping: BackupManifest = {
    ...manifest,
    files: [
      { ...assertDefined(manifest.files[0]), path: '../../etc/hostname' },
    ],
  };
  const manifestFileContents = JSON.stringify(escaping);
  writeFileSync(manifestPath(backupDirectoryPath), manifestFileContents);
  const signatureFile = await prepareSignatureFile({
    type: 'vxadmin_backup',
    context: 'export',
    manifestFileContents,
  });
  writeFileSync(
    join(backupDirectoryPath, signatureFile.fileName),
    signatureFile.fileContents
  );

  // Signed, so the signature check passes: the schema is what has to stop this,
  // because restore writes every path a manifest lists.
  expect((await validateBackup({ backupDirectoryPath })).err()).toEqual(
    expect.objectContaining({ type: 'manifest_unreadable' })
  );
});

test.each(['/etc/hostname', 'a/../../b', 'a//b', 'a/./b', 'a\\b', ''])(
  'rejects the manifest path %o',
  async (path) => {
    const { backupDirectoryPath, manifest } = await createValidBackup();
    writeFileSync(
      manifestPath(backupDirectoryPath),
      JSON.stringify({ ...manifest, files: [{ path, sha256: 'a', size: 0 }] })
    );
    expect(await readManifest(backupDirectoryPath)).toEqual(
      err(expect.anything())
    );
  }
);

test.each<{ error: BackupValidationError; expectedMessage: string }>([
  {
    error: { type: 'manifest_unreadable', message: 'ENOENT' },
    expectedMessage: 'manifest could not be read',
  },
  {
    error: { type: 'signature_invalid', message: 'bad' },
    expectedMessage: 'signature is not valid',
  },
  {
    error: { type: 'manifest_version_unsupported', version: 2 },
    expectedMessage: 'format version 2',
  },
  {
    error: {
      type: 'software_version_mismatch',
      expectedSoftwareVersion: '2',
      actualSoftwareVersion: '1',
    },
    expectedMessage: 'this machine is running 2',
  },
  {
    error: { type: 'file_missing', path: 'data.db' },
    expectedMessage: 'missing data.db',
  },
  {
    error: { type: 'file_not_regular', path: 'data.db' },
    expectedMessage: 'not a regular file',
  },
  {
    error: {
      type: 'file_size_mismatch',
      path: 'data.db',
      expectedSize: 2,
      actualSize: 1,
    },
    expectedMessage: 'should be 2 bytes',
  },
  {
    error: {
      type: 'file_hash_mismatch',
      path: 'data.db',
      expectedSha256: 'a',
      actualSha256: 'b',
    },
    expectedMessage: 'does not match the hash',
  },
  {
    error: { type: 'unexpected_file', path: 'extra' },
    expectedMessage: 'manifest does not list',
  },
])('formats validation error $error.type', ({ error, expectedMessage }) => {
  expect(formatBackupValidationError(error)).toContain(expectedMessage);
});
