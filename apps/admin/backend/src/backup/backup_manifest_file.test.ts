import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { z } from 'zod/v4';
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
  expect(result.unsafeUnwrapErr()).toEqual(
    expect.objectContaining({ type: 'OpenFileError' })
  );
});

test('returns an error when the manifest is not valid JSON', async () => {
  const dir = makeTemporaryDirectory();
  const manifestPath = join(dir, 'manifest.json');
  writeFileSync(manifestPath, 'not json');

  const result = await new BackupManifestFile(manifestPath).readManifest();
  expect(result.unsafeUnwrapErr()).toBeInstanceOf(SyntaxError);
});

test('returns an error when the manifest does not match the schema', async () => {
  const dir = makeTemporaryDirectory();
  const manifestPath = join(dir, 'manifest.json');
  writeFileSync(manifestPath, JSON.stringify({ version: 'invalid' }));

  const result = await new BackupManifestFile(manifestPath).readManifest();
  expect(result.unsafeUnwrapErr()).toBeInstanceOf(z.ZodError);
});
