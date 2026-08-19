import { expect, test } from 'vitest';
import { mockWritable } from '@votingworks/test-utils';
import { unsafeParse } from '@votingworks/types';
import { format } from '@votingworks/utils';
import {
  BACKUP_MANIFEST_VERSION,
  BackupManifest,
  BackupManifestStructSchema,
} from '../backup_manifest.js';
import { StyledPrinter } from './styled_printer.js';
import { backupInfo, unreadableManifest } from './views.js';

const CREATED_AT = '2026-08-18T12:00:00.000Z';

const manifest = BackupManifest.fromStruct(
  unsafeParse(BackupManifestStructSchema, {
    version: BACKUP_MANIFEST_VERSION,
    softwareVersion: '4.0.0',
    machineId: 'VX-00-001',
    createdAt: CREATED_AT,
    election: {
      id: 'election-1',
      title: 'General Election',
      date: '2026-11-03',
    },
    files: [
      { path: 'data/election.db', hash: '0a'.repeat(32), size: 1024 },
      { path: 'logs/vx-logs.log', hash: '1b'.repeat(32), size: 512 },
    ],
  })
);

test('backupInfo renders a tree-style backup summary', () => {
  const stream = mockWritable();
  backupInfo(new StyledPrinter(stream), {
    path: '/media/vx/backup/vxadmin-backups/backup-1',
    manifest,
  });

  expect(stream.toString()).toEqual(
    `● backup-1\n` +
      `│  Election  General Election · 2026-11-03\n` +
      `│  Created   ${format.localeShortDateAndTime(
        new Date(CREATED_AT)
      )} · machine VX-00-001 · 4.0.0\n` +
      `╰─ Files     2 (${format.bytes(1536)})\n`
  );
});

test('unreadableManifest renders the path and error message', () => {
  const stream = mockWritable();
  unreadableManifest(new StyledPrinter(stream), {
    manifestPath: '/backup/manifest.json',
    error: new Error('boom'),
  });

  expect(stream.toString()).toEqual(
    '[Unreadable Manifest] /backup/manifest.json is invalid: boom\n'
  );
});
