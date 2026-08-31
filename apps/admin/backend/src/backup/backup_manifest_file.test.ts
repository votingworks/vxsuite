import { truncateSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { makeTemporaryDirectory } from '@votingworks/fixtures';
import { BackupManifestFile } from './backup_manifest_file.js';
import { BACKUP_MANIFEST_VERSION } from './backup_manifest.js';

const validManifestJson = JSON.stringify({
  version: BACKUP_MANIFEST_VERSION,
  softwareVersion: '4.0.0',
  machineId: 'VX-00-001',
  createdAt: '2026-08-18T12:00:00.000Z',
  election: {
    id: 'election-1',
    title: 'General Election',
    date: '2026-11-03',
  },
  files: [{ path: 'data/election.db', hash: '0a'.repeat(32), size: 1024 }],
});

test('exposes the manifest path', () => {
  const manifestFile = new BackupManifestFile('/backup/manifest.json');
  expect(manifestFile.path).toEqual('/backup/manifest.json');
});

test('reads a valid manifest', async () => {
  const dir = makeTemporaryDirectory();
  const manifestPath = join(dir, 'manifest.json');
  writeFileSync(manifestPath, validManifestJson);

  const manifest = (
    await new BackupManifestFile(manifestPath).readManifest()
  ).unsafeUnwrap();
  expect(manifest.machineId).toEqual('VX-00-001');
  expect(manifest.files).toEqual([
    { path: 'data/election.db', hash: '0a'.repeat(32), size: 1024 },
  ]);
});

test('returns an error when the manifest is missing', async () => {
  const dir = makeTemporaryDirectory();
  const manifestFile = new BackupManifestFile(join(dir, 'manifest.json'));

  const result = await manifestFile.readManifest();
  expect(result.unsafeUnwrapErr()).toMatchObject({
    type: 'read-failed',
    message: expect.stringContaining('ENOENT'),
  });
});

test('returns an error when the manifest is not valid JSON', async () => {
  const dir = makeTemporaryDirectory();
  const manifestPath = join(dir, 'manifest.json');
  writeFileSync(manifestPath, 'not json');

  const result = await new BackupManifestFile(manifestPath).readManifest();
  expect(result.unsafeUnwrapErr()).toMatchObject({ type: 'invalid-manifest' });
});

test('returns an error when the manifest does not match the schema', async () => {
  const dir = makeTemporaryDirectory();
  const manifestPath = join(dir, 'manifest.json');
  writeFileSync(
    manifestPath,
    JSON.stringify({ version: BACKUP_MANIFEST_VERSION, machineId: 42 })
  );

  const result = await new BackupManifestFile(manifestPath).readManifest();
  expect(result.unsafeUnwrapErr()).toMatchObject({ type: 'invalid-manifest' });
});

test('a manifest from another version is its own answer, not a parse failure', async () => {
  const dir = makeTemporaryDirectory();
  const manifestPath = join(dir, 'manifest.json');
  const futureVersion = BACKUP_MANIFEST_VERSION + 1;
  writeFileSync(
    manifestPath,
    validManifestJson.replace(
      `"version":${BACKUP_MANIFEST_VERSION}`,
      `"version":${futureVersion}`
    )
  );

  const result = await new BackupManifestFile(manifestPath).readManifest();
  expect(result.unsafeUnwrapErr()).toEqual({
    type: 'unsupported-version',
    version: futureVersion,
    message: expect.stringContaining(
      `Expected backup version ${BACKUP_MANIFEST_VERSION}`
    ),
  });
});

test('a missing version field is a malformed manifest, not another version', async () => {
  const dir = makeTemporaryDirectory();
  const manifestPath = join(dir, 'manifest.json');
  writeFileSync(manifestPath, JSON.stringify({ machineId: 'VX-00-001' }));

  const result = await new BackupManifestFile(manifestPath).readManifest();
  expect(result.unsafeUnwrapErr()).toMatchObject({ type: 'invalid-manifest' });
});

test('a manifest too large to be one of ours is refused before it is read', async () => {
  const dir = makeTemporaryDirectory();
  const manifestPath = join(dir, 'manifest.json');
  writeFileSync(manifestPath, validManifestJson);
  truncateSync(manifestPath, 100_000_001);

  const result = await new BackupManifestFile(manifestPath).readManifest();
  expect(result.unsafeUnwrapErr()).toMatchObject({
    type: 'read-failed',
    message: expect.stringContaining('100000000'),
  });
});
