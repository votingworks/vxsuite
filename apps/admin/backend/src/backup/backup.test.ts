import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { readdirSync } from 'node:fs';
import { rm, truncate, writeFile } from 'node:fs/promises';
import { makeTemporaryDirectory } from '@votingworks/fixtures';
import { makeBackup, mockDiskSpace } from '../../test/backup.js';
import { Backup } from './backup.js';

vi.mock(
  import('@votingworks/backend'),
  async (importActual): Promise<typeof import('@votingworks/backend')> => {
    const actual = await importActual();
    return { ...actual, getDiskSpaceSummaries: vi.fn() };
  }
);

beforeEach(() => {
  mockDiskSpace();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

test('exposes the backup path', () => {
  expect(new Backup('/media/vx/backup/vxadmin-backups/backup-1').path).toEqual(
    '/media/vx/backup/vxadmin-backups/backup-1'
  );
});

test('locates the manifest and its signature within the backup', () => {
  const backup = new Backup('/media/vx/backup/vxadmin-backups/backup-1');
  expect(backup.manifestPath).toEqual(
    '/media/vx/backup/vxadmin-backups/backup-1/manifest.json'
  );
  expect(backup.signaturePath).toEqual(
    '/media/vx/backup/vxadmin-backups/backup-1/manifest.json.vxsig'
  );
});

test('opens a backup this machine signed', async () => {
  const backup = await makeBackup();
  await using authenticatedBackup = (await backup.open()).unsafeUnwrap();

  // The files themselves stay where they are; only the manifest is copied.
  expect(authenticatedBackup.path).toEqual(backup.path);
  expect((await authenticatedBackup.readManifest()).ok()).toBeDefined();
});

test('a backup with no manifest cannot be read', async () => {
  const backup = await makeBackup();
  await rm(backup.manifestPath);

  expect((await backup.open()).err()).toEqual({
    type: 'read-failed',
    message: expect.stringContaining(backup.manifestPath),
  });
});

test('a manifest too large to be one of ours is refused before it is read', async () => {
  const backup = await makeBackup();
  // Sparse, so this costs nothing on disk: the point is that the size alone is
  // enough to refuse it, without reading whatever it claims to hold.
  await truncate(backup.manifestPath, 100_000_001);

  expect((await backup.open()).err()).toEqual({
    type: 'read-failed',
    message: expect.stringContaining(backup.manifestPath),
  });
});

test('a signature too large to be one of ours is refused before it is read', async () => {
  const backup = await makeBackup();
  await truncate(backup.signaturePath, 100_001);

  // The signature is present, so this is not a backup with no claim to trust —
  // it reads as damage, the same as an oversized manifest.
  expect((await backup.open()).err()).toEqual({
    type: 'read-failed',
    message: expect.stringContaining(backup.signaturePath),
  });
});

test('a backup with no signature cannot be authenticated', async () => {
  const backup = await makeBackup();
  await rm(backup.signaturePath);

  expect((await backup.open()).err()).toEqual({
    type: 'authentication-failed',
    message: expect.stringContaining(backup.signaturePath),
  });
});

test('a backup whose signature does not cover its manifest is refused', async () => {
  const backup = await makeBackup();
  await writeFile(backup.manifestPath, '{}');

  expect((await backup.open()).err()).toMatchObject({
    type: 'authentication-failed',
  });
});

test('a backup that cannot be opened leaves no copy behind', async () => {
  const backup = await makeBackup();
  await rm(backup.signaturePath);

  // Pointed somewhere empty so that what is left behind can be seen exactly,
  // rather than picked out of whatever else is in the system temp directory.
  const temporaryRoot = makeTemporaryDirectory();
  vi.stubEnv('TMPDIR', temporaryRoot);

  expect((await backup.open()).err()).toBeDefined();
  expect(readdirSync(temporaryRoot)).toEqual([]);
});

test('the manifest read is the one that was authenticated', async () => {
  const backup = await makeBackup();
  await using authenticatedBackup = (await backup.open()).unsafeUnwrap();
  const manifest = (await authenticatedBackup.readManifest()).unsafeUnwrap();

  // Whatever the drive says after authentication is not what gets used: a
  // backup normally sits on removable media we do not control.
  await writeFile(
    backup.manifestPath,
    JSON.stringify({ ...manifest.toJSON(), machineId: 'VX-00-999' }, null, 2)
  );

  expect(
    (await authenticatedBackup.readManifest()).unsafeUnwrap().machineId
  ).toEqual(manifest.machineId);
});

test('an opened backup discards its copy of the manifest when disposed', async () => {
  const backup = await makeBackup();
  const authenticatedBackup = (await backup.open()).unsafeUnwrap();
  expect((await authenticatedBackup.readManifest()).ok()).toBeDefined();

  await authenticatedBackup[Symbol.asyncDispose]();

  expect((await authenticatedBackup.readManifest()).err()).toBeDefined();
});
