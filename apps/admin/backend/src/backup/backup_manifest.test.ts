import { expect, test } from 'vitest';
import { DateWithoutTime, err, ok } from '@votingworks/basics';
import { safeParse, unsafeParse } from '@votingworks/types';
import { z } from 'zod/v4';
import {
  BACKUP_MANIFEST_VERSION,
  BackupManifest,
  BackupManifestEntrySchema,
  BackupManifestStruct,
  BackupManifestStructSchema,
  ElectionMetadata,
} from './backup_manifest.js';

const election: ElectionMetadata = {
  id: 'election-1',
  title: 'General Election',
  date: new DateWithoutTime('2026-11-03'),
};

const hashA = '0a'.repeat(32);
const hashB = '1b'.repeat(32);

const validStruct: BackupManifestStruct = {
  version: BACKUP_MANIFEST_VERSION,
  softwareVersion: '4.0.0',
  machineId: 'VX-00-001',
  createdAt: '2026-08-18T12:00:00.000Z',
  election,
  files: [
    { path: 'data/election.db', hash: hashA, size: 1024 },
    { path: 'logs/vx-logs.log', hash: hashB, size: 0 },
  ],
};

test('parses a valid manifest struct', () => {
  const parsed = unsafeParse(BackupManifestStructSchema, validStruct);
  expect(parsed.version).toEqual(BACKUP_MANIFEST_VERSION);
  expect(parsed.softwareVersion).toEqual('4.0.0');
  expect(parsed.machineId).toEqual('VX-00-001');
  expect(parsed.createdAt).toEqual('2026-08-18T12:00:00.000Z');
  expect(parsed.election).toEqual(election);
  expect(parsed.files).toEqual(validStruct.files);
});

test('rejects an unknown manifest version', () => {
  expect(
    safeParse(BackupManifestStructSchema, {
      ...validStruct,
      version: BACKUP_MANIFEST_VERSION + 1,
    })
  ).toEqual(err(expect.anything()));
});

test.each([
  '',
  '/absolute/path',
  'windows\\path',
  '..',
  '../outside',
  'a/../b',
  './a',
  'a//b',
  'a/',
])('rejects manifest entry path: %j', (path) => {
  expect(
    safeParse(BackupManifestEntrySchema, {
      path,
      hash: hashA,
      size: 1,
    })
  ).toEqual(err(expect.anything()));
});

test.each(['a', 'a/b/c', '.hidden', 'a b/c d.txt'])(
  'accepts manifest entry path: %j',
  (path) => {
    expect(
      safeParse(BackupManifestEntrySchema, {
        path,
        hash: hashA,
        size: 1,
      })
    ).toEqual(ok(expect.anything()));
  }
);

test.each([
  '',
  'abc123',
  `sha256:${'0a'.repeat(32)}`,
  '0A'.repeat(32),
  '0g'.repeat(32),
])('rejects manifest entry hash: %j', (hash) => {
  expect(
    safeParse(BackupManifestEntrySchema, {
      path: 'a',
      hash,
      size: 1,
    })
  ).toEqual(err(expect.anything()));
});

test.each([-1, 1.5])('rejects manifest entry size: %j', (size) => {
  expect(
    safeParse(BackupManifestEntrySchema, {
      path: 'a',
      hash: hashA,
      size,
    })
  ).toEqual(err(expect.anything()));
});

test('BackupManifest exposes the struct fields', () => {
  const parsed = unsafeParse(BackupManifestStructSchema, validStruct);
  const manifest = BackupManifest.fromStruct(parsed);
  expect(manifest.softwareVersion).toEqual('4.0.0');
  expect(manifest.machineId).toEqual('VX-00-001');
  expect(manifest.createdAt).toEqual('2026-08-18T12:00:00.000Z');
  expect(manifest.election).toEqual(election);
  expect(manifest.files).toEqual(parsed.files);
});

test('BackupManifest round-trips through toJSON', () => {
  const parsed = unsafeParse(BackupManifestStructSchema, validStruct);
  const manifest = BackupManifest.fromStruct(parsed);
  expect(manifest.toJSON()).toEqual(validStruct);
});

test('toJSON fails fast on an invalid manifest', () => {
  const manifest = new BackupManifest(
    '4.0.0',
    'VX-00-001',
    '2026-08-18T12:00:00.000Z',
    election,
    [{ path: '../outside', hash: hashA, size: 1 }]
  );
  expect(() => manifest.toJSON()).toThrow(z.ZodError);
});
