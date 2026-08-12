import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client as DbClient } from '@votingworks/db';
import { mockBaseLogger } from '@votingworks/logging';
import { makeTemporaryDirectory } from '@votingworks/fixtures';
import { mockWritable } from '@votingworks/test-utils';
import { main, MainOptions, shouldEchoLogsToTerminal } from './cli.js';
import { SyslogWriter } from './syslog.js';
import { BACKUPS_DIRECTORY_NAME, manifestPath } from './manifest.js';
import {
  makeConfiguredWorkspace,
  makeUnconfiguredWorkspace,
} from '../../test/backup.js';

/**
 * A stand-in for the system log, so tests read back what the CLI logged instead
 * of writing to the machine's real log.
 */
function mockSyslog(writeError?: Error): SyslogWriter & { lines: string[] } {
  const lines: string[] = [];
  const errors: unknown[] = [];
  return {
    lines,
    write(logLine) {
      if (writeError) {
        errors.push(writeError);
        return;
      }
      lines.push(logLine);
    },
    flush: () => Promise.resolve(errors),
  };
}

async function run(
  args: string[],
  options: Partial<MainOptions> = {}
): Promise<{
  code: number;
  stdout: string;
  stderr: string;
  logged: string[];
}> {
  const stdout = mockWritable();
  const stderr = mockWritable();
  const syslog = options.syslog ?? mockSyslog();
  const code = await main(
    ['node', 'backups', ...args],
    { stdout, stderr },
    {
      ...options,
      syslog,
    }
  );
  return {
    code,
    stdout: stdout.toString(),
    stderr: stderr.toString(),
    logged: 'lines' in syslog ? (syslog as { lines: string[] }).lines : [],
  };
}

let workspacePath: string;
let targetPath: string;

beforeEach(async () => {
  ({ path: workspacePath } = await makeConfiguredWorkspace());
  targetPath = makeTemporaryDirectory();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

test('shows log lines in the terminal everywhere but a real machine', () => {
  expect(shouldEchoLogsToTerminal('development')).toEqual(true);
  expect(shouldEchoLogsToTerminal('test')).toEqual(true);
  expect(shouldEchoLogsToTerminal(undefined)).toEqual(true);
  expect(shouldEchoLogsToTerminal('production')).toEqual(false);
});

test('requires a command', async () => {
  const { code, stderr } = await run([]);
  expect(code).toEqual(1);
  expect(stderr).toContain('A command is required');
});

test('prints usage with --help', async () => {
  const { code, stdout } = await run(['--help']);
  expect(code).toEqual(0);
  expect(stdout).toContain('Usage: backups <command>');
});

test('rejects an unknown command', async () => {
  const { code, stderr } = await run(['frobnicate']);
  expect(code).toEqual(1);
  expect(stderr).toContain('Unknown argument: frobnicate');
});

test('create requires a workspace', async () => {
  const { code, stderr } = await run(['create', '--target', targetPath]);
  expect(code).toEqual(1);
  expect(stderr).toContain('Missing required argument: workspace');
});

test('create requires a target', async () => {
  const { code, stderr } = await run(['create', '--workspace', workspacePath]);
  expect(code).toEqual(1);
  expect(stderr).toContain('Missing required argument: target');
});

test('create backs up a workspace, and validate accepts the result', async () => {
  const created = await run([
    'create',
    '--workspace',
    workspacePath,
    '--target',
    targetPath,
  ]);
  expect(created.code).toEqual(0);
  expect(created.stdout).toMatch(/Backed up \d+ files \([\d.]+ KB\) to /);
  // Nothing but the summary: log lines and progress both go to stderr, so the
  // path can be read back off stdout.
  expect(created.stdout.trim().split('\n')).toHaveLength(1);
  expect(created.stderr).toMatch(/Copying files\s+\[[█░]+\]\s+\d+%/);
  expect(created.stderr).toContain('"eventId":"backup-create-progress"');

  const backupDirectoryPath = created.stdout.trim().split(' to ')[1] as string;
  const validated = await run(['validate', backupDirectoryPath]);
  expect(validated.code).toEqual(0);
  expect(validated.stdout).toContain('Valid: ');
  // Verifying re-hashes every file, so it has to show it is still working.
  expect(validated.stderr).toMatch(
    /Verifying\s+\[[█░]+\]\s+\d+%\s+[\d.]+ \w?B of [\d.]+ \w?B/
  );

  const listed = await run(['list', targetPath]);
  expect(listed.code).toEqual(0);
  expect(listed.stdout).toContain('General Election');
});

test('create sends its log lines to the system log', async () => {
  const { code, logged } = await run([
    'create',
    '--workspace',
    workspacePath,
    '--target',
    targetPath,
  ]);
  expect(code).toEqual(0);

  // These are the lines an exported log bundle has to contain for a backup
  // taken from the command line to be auditable at all.
  const eventIds = logged.map(
    (line) => (JSON.parse(line) as { eventId: string }).eventId
  );
  expect(eventIds[0]).toEqual('backup-create-init');
  expect(eventIds).toContain('backup-create-progress');
  expect(eventIds[eventIds.length - 1]).toEqual('backup-create-complete');
});

test('create still backs up when the system log cannot be written to', async () => {
  const { code, stdout, stderr } = await run(
    ['create', '--workspace', workspacePath, '--target', targetPath],
    { syslog: mockSyslog(new Error('no /dev/log')) }
  );

  expect(code).toEqual(0);
  expect(stdout).toMatch(/Backed up \d+ files/);
  expect(stderr).toContain('could not be written to the system log');
  expect(stderr).toContain('no /dev/log');
});

test('keeps log lines out of the terminal on a real machine', async () => {
  vi.stubEnv('NODE_ENV', 'production');

  const { stderr, logged } = await run([
    'create',
    '--workspace',
    workspacePath,
    '--target',
    targetPath,
  ]);

  // The backup itself can't succeed here — production means production signing
  // keys, which need a TPM — but the logging is what this is checking, and it
  // happens before that.
  expect(logged.join('\n')).toContain('"eventId":"backup-create-init"');
  expect(stderr).not.toContain('"eventId"');
});

test('create takes the workspace from the environment', async () => {
  vi.stubEnv('ADMIN_WORKSPACE', workspacePath);
  const { code } = await run(['create', '--target', targetPath]);
  expect(code).toEqual(0);
});

test('assumes a development environment when backing up the dev workspace', async () => {
  vi.stubEnv('NODE_ENV', undefined);

  const { code } = await run(
    ['create', '--workspace', workspacePath, '--target', targetPath],
    { devWorkspacePath: workspacePath }
  );

  expect(code).toEqual(0);
  expect(process.env['NODE_ENV']).toEqual('development');
});

test('assumes nothing about the environment for any other workspace', async () => {
  vi.stubEnv('NODE_ENV', undefined);

  const { code, stderr } = await run([
    'create',
    '--workspace',
    workspacePath,
    '--target',
    targetPath,
  ]);

  expect(code).toEqual(1);
  expect(stderr).toContain('Missing required NODE_ENV env var');
  expect(stderr).toContain('Set NODE_ENV=production on a VxAdmin');
  expect(process.env['NODE_ENV']).toBeUndefined();
  // Nothing was copied first: libs/auth doesn't read NODE_ENV until it signs,
  // which on a real workspace is minutes and gigabytes into the job.
  expect(readdirSync(targetPath)).toEqual([]);
});

test('rejects a NODE_ENV it does not understand before doing any work', async () => {
  vi.stubEnv('NODE_ENV', 'staging');

  const { code, stderr } = await run([
    'create',
    '--workspace',
    workspacePath,
    '--target',
    targetPath,
  ]);

  expect(code).toEqual(1);
  expect(stderr).toContain('NODE_ENV should be one of');
  expect(readdirSync(targetPath)).toEqual([]);
});

test('validate checks the environment before reading a backup', async () => {
  vi.stubEnv('NODE_ENV', undefined);

  const { code, stderr } = await run(['validate', targetPath]);

  expect(code).toEqual(1);
  expect(stderr).toContain('Missing required NODE_ENV env var');
});

test('list works without being told the environment', async () => {
  vi.stubEnv('NODE_ENV', undefined);

  // Listing reads manifests and never signs or verifies, so it has no reason
  // to insist on knowing which keys would be used.
  const { code, stderr } = await run(['list', targetPath]);

  expect(code).toEqual(1);
  expect(stderr).toContain('No backups found in');
});

test('create reports a failed backup', async () => {
  const { path: unconfiguredWorkspacePath } = makeUnconfiguredWorkspace();
  const { code, stderr } = await run([
    'create',
    '--workspace',
    unconfiguredWorkspacePath,
    '--target',
    targetPath,
  ]);
  expect(code).toEqual(1);
  expect(stderr).toContain('Backup failed: No election is configured');
});

test('create says so when the workspace path is not a workspace', async () => {
  const emptyPath = makeTemporaryDirectory();

  const { code, stderr } = await run([
    'create',
    '--workspace',
    emptyPath,
    '--target',
    targetPath,
  ]);

  expect(code).toEqual(1);
  expect(stderr).toContain(`No VxAdmin workspace at ${emptyPath}`);
  // A mistyped path should not leave a workspace behind at the typo, nor
  // report the machine as having no election.
  expect(readdirSync(emptyPath)).toEqual([]);
  expect(stderr).not.toContain('No election is configured');
});

test('validate requires a backup directory', async () => {
  const { code, stderr } = await run(['validate']);
  expect(code).toEqual(1);
  expect(stderr).toContain('Not enough non-option arguments');
});

test('validate rejects a backup that has been tampered with', async () => {
  const created = await run([
    'create',
    '--workspace',
    workspacePath,
    '--target',
    targetPath,
  ]);
  const backupDirectoryPath = created.stdout.trim().split(' to ')[1] as string;
  writeFileSync(manifestPath(backupDirectoryPath), '{}');

  const { code, stderr } = await run(['validate', backupDirectoryPath]);
  expect(code).toEqual(1);
  expect(stderr).toContain('Invalid: ');
});

test('list requires a target directory', async () => {
  const { code, stderr } = await run(['list']);
  expect(code).toEqual(1);
  expect(stderr).toContain('Not enough non-option arguments');
});

test('list reports when there are no backups', async () => {
  const { code, stderr } = await run(['list', targetPath]);
  expect(code).toEqual(1);
  expect(stderr).toContain('No backups found in');
});

test('list ignores transient directories and flags unreadable backups', async () => {
  const backupsDirectoryPath = join(targetPath, BACKUPS_DIRECTORY_NAME);
  mkdirSync(join(backupsDirectoryPath, 'an-election-in-progress'), {
    recursive: true,
  });
  mkdirSync(join(backupsDirectoryPath, 'another-election'));
  writeFileSync(join(backupsDirectoryPath, 'stray-file'), '');

  const { code, stdout } = await run(['list', targetPath]);
  expect(code).toEqual(0);
  expect(stdout).toEqual('another-election\tunreadable manifest\n');
});

test('rejects an unexpected positional argument', async () => {
  const { code, stderr } = await run([
    'create',
    'stray',
    '--workspace',
    workspacePath,
    '--target',
    targetPath,
  ]);
  expect(code).toEqual(1);
  expect(stderr).toContain('Unknown argument: stray');
});

test('rejects an unknown option', async () => {
  const { code, stderr } = await run([
    'create',
    '--workspace',
    workspacePath,
    '--target',
    targetPath,
    '--frobnicate',
  ]);
  expect(code).toEqual(1);
  expect(stderr).toContain('Unknown argument: frobnicate');
});

test('rejects an option without a value', async () => {
  const { code, stderr } = await run([
    'create',
    '--workspace',
    '--target',
    targetPath,
  ]);
  expect(code).toEqual(1);
  expect(stderr).toContain('Not enough arguments following: workspace');
});

test('backs up a workspace whose schema digest does not match, rather than resetting it', async () => {
  // What a developer has after switching to a branch that changes schema.sql:
  // the workspace is fine, but its stamp no longer matches the running code.
  const dbPath = join(workspacePath, 'data.db');
  const restamp = DbClient.fileClient(dbPath, mockBaseLogger({ fn: vi.fn }));
  restamp.run(`update vx_schema_digest set digest = 'from-another-branch'`);

  const { code, stdout } = await run([
    'create',
    '--workspace',
    workspacePath,
    '--target',
    targetPath,
  ]);

  // Opening it through the app's own Store would have renamed data.db aside and
  // left an empty one, so the command asked to copy this workspace would have
  // reset it and then reported it as having no election.
  expect(code).toEqual(0);
  expect(stdout).toMatch(/Backed up \d+ files/);
  expect(
    readdirSync(workspacePath).filter((n) => n.includes('backup-'))
  ).toEqual([]);
  const reread = DbClient.fileClient(dbPath, mockBaseLogger({ fn: vi.fn }));
  expect(reread.one(`select digest from vx_schema_digest`)).toEqual({
    digest: 'from-another-branch',
  });
});
