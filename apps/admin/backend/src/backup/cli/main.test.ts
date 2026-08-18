import { afterEach, expect, test, vi } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeTemporaryDirectory } from '@votingworks/fixtures';
import { format } from '@votingworks/utils';
import {
  MockReadable,
  MockWritable,
  mockReadable,
  mockWritable,
} from '@votingworks/test-utils';
import { BACKUP_MANIFEST_VERSION } from '../backup_manifest.js';
import { main } from './main.js';

interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

interface MockStreams {
  stdin: MockReadable;
  stdout: MockWritable;
  stderr: MockWritable;
}

async function run(args: string[]): Promise<RunResult> {
  const streams: MockStreams = {
    stdin: mockReadable(),
    stdout: mockWritable(),
    stderr: mockWritable(),
  };
  const code = await main(['node', 'backups', ...args], streams);
  return {
    code,
    stdout: streams.stdout.toString(),
    stderr: streams.stderr.toString(),
  };
}

function makeWorkspace(): string {
  const workspace = makeTemporaryDirectory();
  mkdirSync(join(workspace, 'data'));
  writeFileSync(join(workspace, 'data', 'election.db'), 'sqlite');
  return workspace;
}

const MANIFEST_CREATED_AT = '2026-08-18T12:00:00.000Z';

function writeManifest(backupPath: string): void {
  writeFileSync(
    join(backupPath, 'manifest.json'),
    JSON.stringify({
      version: BACKUP_MANIFEST_VERSION,
      softwareVersion: '4.0.0',
      machineId: 'VX-00-001',
      createdAt: MANIFEST_CREATED_AT,
      election: {
        id: 'election-1',
        title: 'General Election',
        date: '2026-11-03',
      },
      files: [{ path: 'data/election.db', hash: '0a'.repeat(32), size: 1024 }],
    })
  );
}

function makeBackup(): string {
  const backup = makeTemporaryDirectory();
  writeManifest(backup);
  return backup;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

test('requires a command', async () => {
  const { code, stderr } = await run([]);
  expect(code).toEqual(1);
  expect(stderr).toContain('A command is required');
});

test('rejects unknown commands', async () => {
  const { code, stderr } = await run(['destroy']);
  expect(code).toEqual(1);
  expect(stderr).toContain('Unknown argument: destroy');
});

test('prints help without error', async () => {
  const { code, stderr } = await run(['--help']);
  expect(code).toEqual(0);
  expect(stderr).toContain('Usage: backups <command> [options]');
});

test('create requires a target', async () => {
  const { code, stderr } = await run([
    'create',
    '--workspace',
    makeTemporaryDirectory(),
  ]);
  expect(code).toEqual(1);
  expect(stderr).toContain('target');
});

test('create lists the workspace files', async () => {
  const { code, stdout, stderr } = await run([
    'create',
    '--workspace',
    makeWorkspace(),
    '--target',
    makeTemporaryDirectory(),
  ]);
  expect(code).toEqual(0);
  expect(stderr).toContain('NOT IMPLEMENTED YET.');
  expect(stdout).toContain('Here are the workspace files to be backed up:');
  expect(stdout).toContain('data/');
  expect(stdout).toContain('data/election.db');
});

test('create uses $ADMIN_WORKSPACE as the default workspace', async () => {
  vi.stubEnv('ADMIN_WORKSPACE', makeWorkspace());
  const { code, stdout } = await run([
    'create',
    '--target',
    makeTemporaryDirectory(),
  ]);
  expect(code).toEqual(0);
  expect(stdout).toContain('data/election.db');
});

test('create fails when the workspace cannot be read', async () => {
  const { code, stderr } = await run([
    'create',
    '--workspace',
    join(makeTemporaryDirectory(), 'does-not-exist'),
    '--target',
    makeTemporaryDirectory(),
  ]);
  expect(code).toEqual(1);
  expect(stderr).toContain('!! Failed to read source entry: [no-entity]');
});

test('validate lists the backup files', async () => {
  const { code, stdout, stderr } = await run(['validate', makeBackup()]);
  expect(code).toEqual(0);
  expect(stderr).toContain('NOT IMPLEMENTED YET.');
  expect(stdout).toContain('Here are the backup files to be validated:');
  expect(stdout).toContain('manifest.json');
});

test('validate fails when the backup cannot be read', async () => {
  const { code, stderr } = await run([
    'validate',
    join(makeTemporaryDirectory(), 'does-not-exist'),
  ]);
  expect(code).toEqual(1);
  expect(stderr).toContain('!! Failed to read source entry: [no-entity]');
});

test('list prints the backups on a backup drive', async () => {
  const target = makeTemporaryDirectory();
  const backupsPath = join(target, 'vxadmin-backups');
  mkdirSync(join(backupsPath, 'backup-1'), { recursive: true });
  mkdirSync(join(backupsPath, 'backup-2'), { recursive: true });
  writeManifest(join(backupsPath, 'backup-1'));
  writeManifest(join(backupsPath, 'backup-2'));

  const { code, stdout, stderr } = await run(['list', target]);
  expect(code).toEqual(0);
  expect(stderr).toEqual('');
  expect(stdout).toContain('● backup-1');
  expect(stdout).toContain('● backup-2');
  expect(stdout).toContain('Election  General Election · 2026-11-03');
  expect(stdout).toContain(
    `Created   ${format.localeShortDateAndTime(
      new Date(MANIFEST_CREATED_AT)
    )} · machine VX-00-001 · 4.0.0`
  );
  expect(stdout).toContain(`Files     1 (${format.bytes(1024)})`);
  // no ANSI escapes (\u001b is ESC) when the output stream is not a TTY
  expect(stdout).not.toContain('\u001b[');
});

test('list reports backups with unreadable manifests on stderr', async () => {
  const target = makeTemporaryDirectory();
  const backupsPath = join(target, 'vxadmin-backups');
  mkdirSync(join(backupsPath, 'backup-1'), { recursive: true });
  mkdirSync(join(backupsPath, 'no-manifest'), { recursive: true });
  writeManifest(join(backupsPath, 'backup-1'));

  const { code, stdout, stderr } = await run(['list', target]);
  expect(code).toEqual(0);
  expect(stdout).toContain('● backup-1');
  expect(stdout).not.toContain('no-manifest');
  expect(stderr).toContain(
    `[Unreadable Manifest] ${join(
      backupsPath,
      'no-manifest',
      'manifest.json'
    )} is invalid:`
  );
});

test('list reports no backups on an unused backup drive', async () => {
  const { code, stdout } = await run(['list', makeTemporaryDirectory()]);
  expect(code).toEqual(0);
  expect(stdout).toContain('No backups found.');
});

test('list fails when the target does not exist', async () => {
  const target = join(makeTemporaryDirectory(), 'does-not-exist');
  const { code, stderr } = await run(['list', target]);
  expect(code).toEqual(1);
  expect(stderr).toContain(
    `Error: unable to list backups: [root-not-found] ${target} does not exist`
  );
});

test('restore prints the backup manifest', async () => {
  const { code, stdout, stderr } = await run([
    'restore',
    '--workspace',
    makeTemporaryDirectory(),
    '--backup',
    makeBackup(),
  ]);
  expect(code).toEqual(0);
  expect(stderr).toContain('NOT IMPLEMENTED YET.');
  expect(stdout).toContain('BackupManifest');
  expect(stdout).toContain('VX-00-001');
});

test('restore fails when the manifest cannot be read', async () => {
  const backup = makeTemporaryDirectory();
  const { code, stderr } = await run([
    'restore',
    '--workspace',
    makeTemporaryDirectory(),
    '--backup',
    backup,
  ]);
  expect(code).toEqual(1);
  expect(stderr).toContain(
    `Error: unable to read manifest at ${join(backup, 'manifest.json')}`
  );
});
