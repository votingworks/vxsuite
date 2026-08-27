import { afterEach, expect, test, vi } from 'vitest';
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  electionFamousNames2021Fixtures,
  makeTemporaryDirectory,
} from '@votingworks/fixtures';
import { format } from '@votingworks/utils';
import {
  MockReadable,
  MockWritable,
  mockReadable,
  mockWritable,
} from '@votingworks/test-utils';
import { Client } from '@votingworks/db';
import { BaseLogger, LogSource, mockBaseLogger } from '@votingworks/logging';
import { DateWithoutTime } from '@votingworks/basics';
import {
  DEFAULT_SYSTEM_SETTINGS,
  DEV_MACHINE_ID,
  LATEST_SOFTWARE_VERSION,
  safeParseJson,
} from '@votingworks/types';
import { createHash } from 'node:crypto';
import { prepareSignatureFile } from '@votingworks/auth';
import { readFile, stat } from 'node:fs/promises';
import {
  BackupManifest,
  BackupManifestStructSchema,
} from '../backup_manifest.js';
import { main } from './main.js';
import { createWorkspace, Workspace } from '../../util/workspace.js';

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
  // A real logger would write JSON log lines to the test runner's stdout,
  // interleaved with the command's own output.
  const code = await main(['node', 'backups', ...args], {
    ...streams,
    logger: mockBaseLogger({ fn: vi.fn }),
  });
  return {
    code,
    stdout: streams.stdout.toString(),
    stderr: streams.stderr.toString(),
  };
}

async function makeWorkspace(logger: BaseLogger): Promise<Workspace> {
  const workspace = createWorkspace(makeTemporaryDirectory(), logger);
  const { electionPackage, readElectionDefinition } =
    electionFamousNames2021Fixtures;
  const electionPackageSourceFilePath = electionPackage.asFilePath();
  const electionPackageHash = createHash('sha256')
    .update(electionPackage.asBuffer())
    .digest('hex');
  const electionId = await workspace.store.addElection({
    electionData: readElectionDefinition().electionData,
    systemSettingsData: JSON.stringify(DEFAULT_SYSTEM_SETTINGS),
    electionPackageSourceFilePath,
    electionPackageHash,
  });
  workspace.store.setCurrentElectionId(electionId);
  return workspace;
}

const MANIFEST_CREATED_AT = '2026-08-18T12:00:00.000Z';

async function writeManifest(backupPath: string): Promise<void> {
  const manifestFileContents = JSON.stringify(
    new BackupManifest(
      '4.0.0',
      'VX-00-001',
      MANIFEST_CREATED_AT,
      {
        id: 'election-1',
        title: 'General Election',
        date: new DateWithoutTime('2026-11-03'),
      },
      [{ path: 'data/election.db', hash: '0a'.repeat(32), size: 1024 }]
    )
  );
  await writeSignedManifest(backupPath, manifestFileContents);
}

/**
 * Writes a manifest and, alongside it, the signature that authenticates it,
 * since reading a manifest means authenticating it first.
 */
async function writeSignedManifest(
  backupPath: string,
  manifestFileContents: string
): Promise<void> {
  writeFileSync(join(backupPath, 'manifest.json'), manifestFileContents);
  const signatureFile = await prepareSignatureFile({
    type: 'vxadmin_backup',
    context: 'export',
    manifestFileContents,
  });
  writeFileSync(
    join(backupPath, signatureFile.fileName),
    signatureFile.fileContents
  );
}

async function makeBackup(): Promise<string> {
  const backup = makeTemporaryDirectory();
  await writeManifest(backup);
  mkdirSync(join(backup, 'workspace'));
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

test('a logger is optional, since the real entry point does not have one', async () => {
  const stderr = mockWritable();
  const code = await main(['node', 'backups', '--help'], {
    stdin: mockReadable(),
    stdout: mockWritable(),
    stderr,
  });
  expect(code).toEqual(0);
  expect(stderr.toString()).toContain('Usage: backups <command> [options]');
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

test('create refuses when no election is configured', async () => {
  const logger = new BaseLogger(LogSource.VxAdminService);
  const workspace = await makeWorkspace(logger);
  await workspace.store.reset();

  const target = makeTemporaryDirectory();
  const { code } = await run([
    'create',
    '--workspace',
    workspace.path,
    '--target',
    target,
  ]);
  expect(code).toEqual(1);

  expect(readdirSync(target)).toEqual([]);
});

test('create copies the database into a directory within the target', async () => {
  const logger = new BaseLogger(LogSource.VxAdminService);
  const workspace = await makeWorkspace(logger);
  const target = makeTemporaryDirectory();
  const { code, stdout, stderr } = await run([
    'create',
    '--workspace',
    workspace.path,
    '--target',
    target,
  ]);
  expect(code).toEqual(0);

  // Progress is reported on stderr, one line per step since the mock stream is
  // not a terminal, and never mixed into stdout.
  expect(stderr).toContain('Snapshotting database');
  expect(stderr).toContain('Copying files');
  expect(stderr).toContain('Swapping into place');
  // \u001b is ESC: nothing tries to move a cursor that isn't there.
  expect(stderr).not.toContain('\u001b');

  // Once done, stdout carries the same summary `list` would show for it.
  expect(stdout).toContain(
    '● franklin-county_lincoln-municipal-general-election_dc2aa66c40'
  );
  expect(stdout).toContain('Election  Lincoln Municipal General Election · ');
  expect(stdout).toContain('Files     ');

  // `create` writes where `list` reads: under `vxadmin-backups`.
  const backups = readdirSync(join(target, 'vxadmin-backups'), {
    withFileTypes: true,
  });
  expect(backups).toHaveLength(1);
  const backup = backups[0]!;
  expect(backup.isDirectory()).toBeTruthy();
  expect(backup.name).toEqual(
    'franklin-county_lincoln-municipal-general-election_dc2aa66c40'
  );

  const backupWorkspace = join(backup.parentPath, backup.name, 'workspace');
  const backupWorkspaceNames = readdirSync(backupWorkspace);
  expect(backupWorkspaceNames).toContain('data.db');
  const client = Client.fileClient(
    join(backupWorkspace, 'data.db'),
    mockBaseLogger({ fn: vi.fn })
  );
  const { count } = client.one('select count(*) as count from elections') as {
    count: number;
  };
  expect(count).toEqual(1);

  const manifestPath = join(backup.parentPath, backup.name, 'manifest.json');
  const manifest = safeParseJson(
    await readFile(manifestPath, 'utf-8'),
    BackupManifestStructSchema
  ).unsafeUnwrap();
  expect(manifest.machineId).toEqual(DEV_MACHINE_ID);
  expect(manifest.softwareVersion).toEqual(LATEST_SOFTWARE_VERSION);
  expect(manifest.election.title).toEqual(
    electionFamousNames2021Fixtures.readElectionDefinition().election.title
  );

  const dbEntry = manifest.files.find(
    (file) => file.path === 'workspace/data.db'
  );
  const expectedDbPath = join(backupWorkspace, 'data.db');
  expect(dbEntry).toBeDefined();
  expect(dbEntry?.size).toEqual((await stat(expectedDbPath)).size);
  expect(dbEntry?.hash).toEqual(
    createHash('sha256')
      .update(await readFile(expectedDbPath))
      .digest('hex')
  );
});

test('create uses $ADMIN_WORKSPACE as the default workspace', async () => {
  const logger = new BaseLogger(LogSource.VxAdminService);
  const workspace = await makeWorkspace(logger);
  vi.stubEnv('ADMIN_WORKSPACE', workspace.path);
  const { code } = await run(['create', '--target', makeTemporaryDirectory()]);
  expect(code).toEqual(0);
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
  expect(stderr).toContain('Workspace directory could not be found');
});

test('create fails fast when the workspace cannot be opened for another reason', async () => {
  const workspace = join(makeTemporaryDirectory(), 'a-file');
  writeFileSync(workspace, 'not a workspace');

  await expect(
    run([
      'create',
      '--workspace',
      workspace,
      '--target',
      makeTemporaryDirectory(),
    ])
  ).rejects.toThrow('ENOTDIR');
});

test('validate lists the backup files', async () => {
  const { code, stdout, stderr } = await run(['validate', await makeBackup()]);
  expect(code).toEqual(0);
  expect(stderr).toContain('NOT IMPLEMENTED YET.');
  expect(stdout).toContain('Here are the backup files to be validated:');
  expect(stdout).toContain('manifest.json');
  expect(stdout).toContain('workspace/');
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
  await writeManifest(join(backupsPath, 'backup-1'));
  await writeManifest(join(backupsPath, 'backup-2'));

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
  mkdirSync(join(backupsPath, 'damaged-manifest'), { recursive: true });
  await writeManifest(join(backupsPath, 'backup-1'));
  // Signed, so this is a backup of ours whose manifest did not survive the
  // trip, as opposed to one we cannot authenticate at all.
  await writeSignedManifest(
    join(backupsPath, 'damaged-manifest'),
    'not a manifest'
  );

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
  expect(stderr).toContain(
    `[Unreadable Manifest] ${join(
      backupsPath,
      'damaged-manifest',
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
    await makeBackup(),
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
