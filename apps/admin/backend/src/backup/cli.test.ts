import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { Buffer } from 'node:buffer';
import { describe, expect, test, beforeEach, vi, afterEach } from 'vitest';
import { assertDefined } from '@votingworks/basics';
import { Client as DbClient } from '@votingworks/db';
import {
  electionGeneralFixtures,
  makeTemporaryDirectory,
} from '@votingworks/fixtures';
import { mockBaseLogger } from '@votingworks/logging';
import { DEFAULT_SYSTEM_SETTINGS } from '@votingworks/types';
import { mockWritable } from '@votingworks/test-utils';

import { createWorkspace, Workspace } from '../util/workspace';
import { signManifest } from './signing';
import {
  BACKUP_DB_FILENAME,
  BACKUP_IMAGES_DIR,
  BACKUP_ROOT_DIR,
  BackupManifest,
  BackupProgress,
  MANIFEST_FILENAME,
  MANIFEST_SIGNATURE_FILENAME,
  RestoreProgress,
} from './types';
import {
  createSigintCanceller,
  formatProgress,
  formatRestoreProgress,
  formatSize,
  Io,
  main,
} from './cli';

let tmpDir: string;

type MockIo = Io & {
  stdout: ReturnType<typeof mockWritable>;
  stderr: ReturnType<typeof mockWritable>;
};

function createIo(): MockIo {
  return { stdout: mockWritable(), stderr: mockWritable() };
}

/** Write a string and return its SHA256 hash. */
function writeFileWithHash(filePath: string, content: string): string {
  writeFileSync(filePath, content, 'utf-8');
  return createHash('sha256').update(content, 'utf-8').digest('hex');
}

/** Create a valid backup directory with manifest, signature, database, and optional images. */
function createBackupDir(
  mountPoint: string,
  dirName: string,
  options: {
    electionId?: string;
    electionTitle?: string;
    electionDate?: string;
    machineId?: string;
    softwareVersion?: string;
    createdAt?: string;
    images?: Array<{ relPath: string; content: string }>;
  } = {}
): string {
  const {
    electionId = 'election-1',
    electionTitle = 'General Election',
    electionDate = '2026-11-03',
    machineId = 'VX-00-001',
    softwareVersion = 'dev',
    createdAt = '2026-03-30T12:00:00.000Z',
    images = [],
  } = options;

  const backupRoot = join(mountPoint, BACKUP_ROOT_DIR);
  mkdirSync(backupRoot, { recursive: true });
  const backupDir = join(backupRoot, dirName);
  mkdirSync(backupDir, { recursive: true });
  mkdirSync(join(backupDir, BACKUP_IMAGES_DIR), { recursive: true });

  const files: Array<{ path: string; sha256: string; size: number }> = [];

  // Write database file
  const dbContent = 'fake-database-content';
  const dbHash = writeFileWithHash(
    join(backupDir, BACKUP_DB_FILENAME),
    dbContent
  );
  files.push({
    path: BACKUP_DB_FILENAME,
    sha256: dbHash,
    size: Buffer.byteLength(dbContent),
  });

  // Write image files
  for (const image of images) {
    const imagePath = join(BACKUP_IMAGES_DIR, image.relPath);
    const fullPath = join(backupDir, imagePath);
    mkdirSync(join(fullPath, '..'), { recursive: true });
    const hash = writeFileWithHash(fullPath, image.content);
    files.push({
      path: imagePath,
      sha256: hash,
      size: Buffer.byteLength(image.content),
    });
  }

  const manifest: BackupManifest = {
    version: 1,
    electionId,
    electionTitle,
    electionDate,
    machineId,
    softwareVersion,
    createdAt,
    files,
  };

  const manifestJson = JSON.stringify(manifest, null, 2);
  writeFileSync(join(backupDir, MANIFEST_FILENAME), manifestJson, 'utf-8');
  writeFileSync(
    join(backupDir, MANIFEST_SIGNATURE_FILENAME),
    signManifest(manifestJson)
  );

  return backupDir;
}

/** Create a workspace with a configured election. */
function createTestWorkspace(workspacePath: string): Workspace {
  const logger = mockBaseLogger({ fn: vi.fn });
  const workspace = createWorkspace(workspacePath, logger);
  const { store } = workspace;

  const electionDefinition = electionGeneralFixtures.readElectionDefinition();
  const { electionData } = electionDefinition;
  const electionId = store.addElection({
    electionData,
    systemSettingsData: JSON.stringify(DEFAULT_SYSTEM_SETTINGS),
    electionPackageFileContents: Buffer.of(),
    electionPackageHash: 'test-hash',
  });
  store.setCurrentElectionId(electionId);

  return workspace;
}

/**
 * Add a ballot image file to both the database and the filesystem so
 * that `listBallotImagesFromDb` will find it during backup.
 */
function addBallotImageToWorkspace(
  workspacePath: string,
  imageContent: string,
  cvrId: string,
  side: 'front' | 'back'
): void {
  const logger = mockBaseLogger({ fn: vi.fn });
  const dbPath = join(workspacePath, 'data.db');
  const client = DbClient.fileClient(dbPath, logger);

  const { id: electionId } = client.one('select id from elections limit 1') as {
    id: string;
  };
  const { id: electionDefId } = client.one(
    `select election_data ->> 'id' as id from elections limit 1`
  ) as { id: string };

  // Ensure scanner batch exists
  client.run(
    `insert or ignore into scanner_batches (id, label, scanner_id, election_id, started_at)
     values ('test-batch', 'Test', 'scanner-1', ?, datetime('now'))`,
    electionId
  );
  // Ensure CVR exists
  client.run(
    `insert or ignore into cvrs (id, election_id, ballot_id, ballot_style_group_id, ballot_type, batch_id, precinct_id, votes, is_blank, has_overvote, has_undervote, has_write_in)
     values (?, ?, ?, '1', 'precinct', 'test-batch', 'precinct-1', '{}', 0, 0, 0, 0)`,
    cvrId,
    electionId,
    `ballot-${cvrId}`
  );
  // Add ballot image record
  client.run(
    'insert or ignore into ballot_images (cvr_id, side) values (?, ?)',
    cvrId,
    side
  );

  // Write the image file at the expected path
  const imageDir = join(workspacePath, 'ballot-images', electionDefId);
  mkdirSync(imageDir, { recursive: true });
  writeFileSync(join(imageDir, `${cvrId}-${side}`), imageContent);
}

function argv(...args: string[]): string[] {
  return ['node', 'backup', ...args];
}

beforeEach(() => {
  tmpDir = makeTemporaryDirectory();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('formatProgress', () => {
  test('formats each backup phase', () => {
    expect(
      formatProgress({ phase: 'preflight', imagesTotal: 0, imagesCopied: 0 })
    ).toContain('Pre-flight');
    expect(
      formatProgress({ phase: 'snapshot', imagesTotal: 0, imagesCopied: 0 })
    ).toContain('database snapshot');
    expect(
      formatProgress({ phase: 'images', imagesTotal: 0, imagesCopied: 0 })
    ).toContain('Processing');
    expect(
      formatProgress({ phase: 'images', imagesTotal: 10, imagesCopied: 3 })
    ).toContain('3/10');
    expect(
      formatProgress({ phase: 'signing', imagesTotal: 0, imagesCopied: 0 })
    ).toContain('Signing');
    expect(
      formatProgress({ phase: 'validating', imagesTotal: 0, imagesCopied: 0 })
    ).toContain('Validating');
    expect(
      formatProgress({
        phase: 'unknown' as BackupProgress['phase'],
        imagesTotal: 0,
        imagesCopied: 0,
      })
    ).toEqual('unknown...');
  });
});

describe('formatRestoreProgress', () => {
  test('formats each restore phase', () => {
    expect(
      formatRestoreProgress({
        phase: 'preflight',
        filesTotal: 0,
        filesCopied: 0,
      })
    ).toContain('Validating');
    expect(
      formatRestoreProgress({ phase: 'copying', filesTotal: 0, filesCopied: 0 })
    ).toContain('Copying files');
    expect(
      formatRestoreProgress({ phase: 'copying', filesTotal: 5, filesCopied: 2 })
    ).toContain('2/5');
    expect(
      formatRestoreProgress({
        phase: 'activating',
        filesTotal: 0,
        filesCopied: 0,
      })
    ).toContain('Activating');
    expect(
      formatRestoreProgress({
        phase: 'unknown' as RestoreProgress['phase'],
        filesTotal: 0,
        filesCopied: 0,
      })
    ).toEqual('unknown...');
  });
});

describe('formatSize', () => {
  test('formats various sizes', () => {
    expect(formatSize(500)).toEqual('500 bytes');
    expect(formatSize(1_500)).toEqual('1.5 KB');
    expect(formatSize(5_000_000)).toEqual('5.0 MB');
    expect(formatSize(2_500_000_000)).toEqual('2.5 GB');
  });
});

describe('createSigintCanceller', () => {
  test('first SIGINT sets cancel, second force-exits', () => {
    const io = createIo();
    const exitMock = vi
      .spyOn(process, 'exit')
      .mockImplementation(() => undefined as never);
    const { controller, cleanup } = createSigintCanceller(io);

    expect(controller.signal.aborted).toEqual(false);
    process.emit('SIGINT');
    expect(controller.signal.aborted).toEqual(true);
    expect(io.stderr.toString()).toContain('Cancelling');

    process.emit('SIGINT');
    expect(exitMock).toHaveBeenCalledWith(130);

    cleanup();
    exitMock.mockRestore();
  });
});

describe('CLI argument parsing', () => {
  test('no command shows usage and exits 1', async () => {
    const io = createIo();
    const code = await main(argv(), io);
    expect(code).toEqual(1);
    expect(io.stderr.toString()).toContain('Usage:');
  });

  test('unknown command shows error and usage', async () => {
    const io = createIo();
    const code = await main(argv('bogus'), io);
    expect(code).toEqual(1);
    expect(io.stderr.toString()).toContain('Unknown command: bogus');
  });

  test('help command shows usage and exits 0', async () => {
    const io = createIo();
    const code = await main(argv('help'), io);
    expect(code).toEqual(0);
    expect(io.stdout.toString()).toContain('Usage:');
  });

  test('--help shows usage and exits 0', async () => {
    const io = createIo();
    const code = await main(argv('--help'), io);
    expect(code).toEqual(0);
  });

  test('-h shows usage and exits 0', async () => {
    const io = createIo();
    const code = await main(argv('-h'), io);
    expect(code).toEqual(0);
  });
});

describe('list command', () => {
  test('requires mount point argument', async () => {
    const io = createIo();
    const code = await main(argv('list'), io);
    expect(code).toEqual(1);
    expect(io.stderr.toString()).toContain('mount point is required');
  });

  test('errors on non-existent mount point', async () => {
    const io = createIo();
    const code = await main(argv('list', '/nonexistent/path'), io);
    expect(code).toEqual(1);
    expect(io.stderr.toString()).toContain('does not exist');
  });

  test('shows message when no backups found', async () => {
    const io = createIo();
    const mountPoint = join(tmpDir, 'empty-drive');
    mkdirSync(mountPoint, { recursive: true });
    const code = await main(argv('list', mountPoint), io);
    expect(code).toEqual(0);
    expect(io.stdout.toString()).toContain('No backups found.');
  });

  test('lists backups with metadata', async () => {
    const io = createIo();
    const mountPoint = join(tmpDir, 'drive');
    mkdirSync(mountPoint, { recursive: true });

    createBackupDir(mountPoint, 'election-2026-general', {
      electionTitle: 'General Election 2026',
      electionDate: '2026-11-03',
      machineId: 'VX-00-001',
      softwareVersion: '1.0.0',
      createdAt: '2026-03-30T12:00:00.000Z',
    });

    const code = await main(argv('list', mountPoint), io);
    expect(code).toEqual(0);
    const out = io.stdout.toString();
    expect(out).toContain('1 backup(s)');
    expect(out).toContain('General Election 2026');
    expect(out).toContain('VX-00-001');
    expect(out).toContain('1.0.0');
  });

  test('lists multiple backups sorted by date', async () => {
    const io = createIo();
    const mountPoint = join(tmpDir, 'drive');
    mkdirSync(mountPoint, { recursive: true });

    createBackupDir(mountPoint, 'election-old', {
      electionTitle: 'Old Election',
      createdAt: '2025-01-01T00:00:00.000Z',
    });
    createBackupDir(mountPoint, 'election-new', {
      electionTitle: 'New Election',
      createdAt: '2026-06-01T00:00:00.000Z',
    });

    const code = await main(argv('list', mountPoint), io);
    expect(code).toEqual(0);
    expect(io.stdout.toString()).toContain('2 backup(s)');
  });
});

describe('validate command', () => {
  test('requires backup directory argument', async () => {
    const io = createIo();
    const code = await main(argv('validate'), io);
    expect(code).toEqual(1);
    expect(io.stderr.toString()).toContain('backup directory path is required');
  });

  test('errors on non-existent path', async () => {
    const io = createIo();
    const code = await main(argv('validate', '/nonexistent/path'), io);
    expect(code).toEqual(1);
    expect(io.stderr.toString()).toContain('does not exist');
  });

  test('validates a good backup', async () => {
    const io = createIo();
    const mountPoint = join(tmpDir, 'drive');
    mkdirSync(mountPoint, { recursive: true });
    const backupDir = createBackupDir(mountPoint, 'election-good', {
      electionTitle: 'Good Election',
      images: [{ relPath: 'batch1/image1.jpg', content: 'image-data-1' }],
    });

    const code = await main(argv('validate', backupDir), io);
    expect(code).toEqual(0);
    const out = io.stdout.toString();
    expect(out).toContain('Validation passed.');
    expect(out).toContain('Good Election');
  });

  test('reports validation failure for tampered manifest', async () => {
    const io = createIo();
    const mountPoint = join(tmpDir, 'drive');
    mkdirSync(mountPoint, { recursive: true });
    const backupDir = createBackupDir(mountPoint, 'election-tampered');

    const manifestPath = join(backupDir, MANIFEST_FILENAME);
    const original = readFileSync(manifestPath, 'utf-8');
    writeFileSync(
      manifestPath,
      original.replace('General Election', 'TAMPERED'),
      'utf-8'
    );

    const code = await main(argv('validate', backupDir), io);
    expect(code).toEqual(1);
    expect(io.stderr.toString()).toContain('signature is invalid');
  });

  test('reports validation failure for tampered file', async () => {
    const io = createIo();
    const mountPoint = join(tmpDir, 'drive');
    mkdirSync(mountPoint, { recursive: true });
    const backupDir = createBackupDir(mountPoint, 'election-tampered', {
      images: [{ relPath: 'batch1/image1.jpg', content: 'original-data' }],
    });

    writeFileSync(
      join(backupDir, BACKUP_IMAGES_DIR, 'batch1/image1.jpg'),
      'tampered-data',
      'utf-8'
    );

    const manifestJson = readFileSync(
      join(backupDir, MANIFEST_FILENAME),
      'utf-8'
    );
    writeFileSync(
      join(backupDir, MANIFEST_SIGNATURE_FILENAME),
      signManifest(manifestJson)
    );

    const code = await main(argv('validate', backupDir), io);
    expect(code).toEqual(1);
    expect(io.stderr.toString()).toContain('Hash mismatch');
  });
});

describe('backup command', () => {
  test('requires workspace and mount-point flags', async () => {
    const io = createIo();
    const code = await main(argv('backup', '--workspace', tmpDir), io);
    expect(code).toEqual(1);
    expect(io.stderr.toString()).toContain(
      'Missing required option: --mount-point'
    );
  });

  test('validates workspace exists', async () => {
    const io = createIo();
    const code = await main(
      argv('backup', '--workspace', '/nonexistent', '--mount-point', tmpDir),
      io
    );
    expect(code).toEqual(1);
    expect(io.stderr.toString()).toContain('Workspace does not exist');
  });

  test('validates workspace has data.db', async () => {
    const io = createIo();
    const workspace = join(tmpDir, 'empty-workspace');
    mkdirSync(workspace, { recursive: true });
    const code = await main(
      argv('backup', '--workspace', workspace, '--mount-point', tmpDir),
      io
    );
    expect(code).toEqual(1);
    expect(io.stderr.toString()).toContain('Database not found');
  });

  test('validates mount point exists', async () => {
    const io = createIo();
    const { path: workspace } = createTestWorkspace(join(tmpDir, 'workspace'));
    const code = await main(
      argv('backup', '--workspace', workspace, '--mount-point', '/nonexistent'),
      io
    );
    expect(code).toEqual(1);
    expect(io.stderr.toString()).toContain('Mount point does not exist');
  });

  test('validates mount point is a directory', async () => {
    const io = createIo();
    const { path: workspace } = createTestWorkspace(join(tmpDir, 'workspace2'));
    const filePath = join(tmpDir, 'not-a-dir');
    writeFileSync(filePath, 'just a file');
    const code = await main(
      argv('backup', '--workspace', workspace, '--mount-point', filePath),
      io
    );
    expect(code).toEqual(1);
    expect(io.stderr.toString()).toContain('not a directory');
  });

  test('errors when election record is missing from database', async () => {
    const io = createIo();
    const workspacePath = join(tmpDir, 'missing-election');
    const logger = mockBaseLogger({ fn: vi.fn });
    createWorkspace(workspacePath, logger);
    const client = DbClient.fileClient(join(workspacePath, 'data.db'), logger);
    client.run('PRAGMA foreign_keys = OFF');
    client.run('update settings set current_election_id = ?', 'nonexistent-id');
    client.run('PRAGMA foreign_keys = ON');

    const mountPoint = join(tmpDir, 'usb');
    mkdirSync(mountPoint, { recursive: true });
    const code = await main(
      argv('backup', '--workspace', workspacePath, '--mount-point', mountPoint),
      io
    );
    expect(code).toEqual(1);
    expect(io.stderr.toString()).toContain('Election record not found');
  });

  test('errors when election data is corrupt', async () => {
    const io = createIo();
    const workspacePath = join(tmpDir, 'corrupt-election');
    const logger = mockBaseLogger({ fn: vi.fn });
    createWorkspace(workspacePath, logger);
    const client = DbClient.fileClient(join(workspacePath, 'data.db'), logger);
    client.run(
      `insert into elections (id, election_data, system_settings_data, election_package_file_contents, election_package_hash)
       values (?, 'not-valid-json', '{}', x'00', 'hash')`,
      'corrupt-id'
    );
    client.run('update settings set current_election_id = ?', 'corrupt-id');

    const mountPoint = join(tmpDir, 'usb');
    mkdirSync(mountPoint, { recursive: true });
    const code = await main(
      argv('backup', '--workspace', workspacePath, '--mount-point', mountPoint),
      io
    );
    expect(code).toEqual(1);
    expect(io.stderr.toString()).toContain('Failed to parse election');
  });

  test('errors when no election is configured', async () => {
    const io = createIo();
    const workspacePath = join(tmpDir, 'no-election');
    const logger = mockBaseLogger({ fn: vi.fn });
    createWorkspace(workspacePath, logger);

    const mountPoint = join(tmpDir, 'usb');
    mkdirSync(mountPoint, { recursive: true });

    const code = await main(
      argv('backup', '--workspace', workspacePath, '--mount-point', mountPoint),
      io
    );
    expect(code).toEqual(1);
    expect(io.stderr.toString()).toContain(
      'No election is currently configured'
    );
  });

  test('performs a successful backup, reading election from database', async () => {
    const io = createIo();
    const { path: workspace } = createTestWorkspace(join(tmpDir, 'workspace'));
    const mountPoint = join(tmpDir, 'usb');
    mkdirSync(mountPoint, { recursive: true });

    const code = await main(
      argv('backup', '--workspace', workspace, '--mount-point', mountPoint),
      io
    );
    expect(code).toEqual(0);
    expect(io.stdout.toString()).toContain('Backup completed successfully');

    const backupRootPath = join(mountPoint, BACKUP_ROOT_DIR);
    const backupDirs = existsSync(backupRootPath)
      ? readdirSync(backupRootPath)
      : [];
    expect(backupDirs.length).toEqual(1);

    const backupDir = join(backupRootPath, assertDefined(backupDirs[0]));
    expect(existsSync(join(backupDir, MANIFEST_FILENAME))).toEqual(true);
    expect(existsSync(join(backupDir, MANIFEST_SIGNATURE_FILENAME))).toEqual(
      true
    );
    expect(existsSync(join(backupDir, BACKUP_DB_FILENAME))).toEqual(true);

    const manifest: BackupManifest = JSON.parse(
      readFileSync(join(backupDir, MANIFEST_FILENAME), 'utf-8')
    );
    expect(manifest.electionId).toBeDefined();
    expect(manifest.electionTitle).toBeDefined();
    expect(manifest.electionTitle.length).toBeGreaterThan(0);
  });

  test('performs backup with ballot images', async () => {
    const io = createIo();
    const { path: workspace } = createTestWorkspace(join(tmpDir, 'workspace'));

    addBallotImageToWorkspace(workspace, 'image-data-1', 'cvr-1', 'front');
    addBallotImageToWorkspace(workspace, 'image-data-2', 'cvr-1', 'back');

    const mountPoint = join(tmpDir, 'usb');
    mkdirSync(mountPoint, { recursive: true });

    const code = await main(
      argv('backup', '--workspace', workspace, '--mount-point', mountPoint),
      io
    );
    expect(code).toEqual(0);

    const backupRootPath = join(mountPoint, BACKUP_ROOT_DIR);
    const backupDirs = readdirSync(backupRootPath);
    const backupDir = join(backupRootPath, assertDefined(backupDirs[0]));
    const manifest: BackupManifest = JSON.parse(
      readFileSync(join(backupDir, MANIFEST_FILENAME), 'utf-8')
    );
    expect(manifest.files.length).toEqual(3);
  });
});

describe('restore command', () => {
  test('requires workspace and mount-point flags', async () => {
    const io = createIo();
    const code = await main(argv('restore', '--workspace', tmpDir), io);
    expect(code).toEqual(1);
    expect(io.stderr.toString()).toContain(
      'Missing required option: --mount-point'
    );
  });

  test('validates mount point exists', async () => {
    const io = createIo();
    const code = await main(
      argv('restore', '--workspace', tmpDir, '--mount-point', '/nonexistent'),
      io
    );
    expect(code).toEqual(1);
    expect(io.stderr.toString()).toContain('Mount point does not exist');
  });

  test('errors when no backups on drive', async () => {
    const io = createIo();
    const mountPoint = join(tmpDir, 'usb');
    mkdirSync(mountPoint, { recursive: true });
    const workspace = join(tmpDir, 'workspace');
    mkdirSync(workspace, { recursive: true });

    const code = await main(
      argv('restore', '--workspace', workspace, '--mount-point', mountPoint),
      io
    );
    expect(code).toEqual(1);
    expect(io.stderr.toString()).toContain('No backups found');
  });

  test('errors when multiple backups on drive', async () => {
    const io = createIo();
    const mountPoint = join(tmpDir, 'usb');
    mkdirSync(mountPoint, { recursive: true });
    createBackupDir(mountPoint, 'backup-a', { electionTitle: 'Election A' });
    createBackupDir(mountPoint, 'backup-b', { electionTitle: 'Election B' });

    const workspace = join(tmpDir, 'workspace');
    mkdirSync(workspace, { recursive: true });

    const code = await main(
      argv('restore', '--workspace', workspace, '--mount-point', mountPoint),
      io
    );
    expect(code).toEqual(1);
    expect(io.stderr.toString()).toContain('Multiple backups found');
  });

  test('auto-detects single backup on drive', async () => {
    const io = createIo();
    const mountPoint = join(tmpDir, 'usb');
    mkdirSync(mountPoint, { recursive: true });
    createBackupDir(mountPoint, 'election-restore', {
      electionTitle: 'Restore Test Election',
      electionDate: '2026-11-03',
    });

    const workspace = join(tmpDir, 'restore-workspace');
    mkdirSync(workspace, { recursive: true });

    const code = await main(
      argv('restore', '--workspace', workspace, '--mount-point', mountPoint),
      io
    );
    expect(code).toEqual(0);
    const out = io.stdout.toString();
    expect(out).toContain('Restore completed successfully');
    expect(out).toContain('Restore Test Election');
    expect(existsSync(join(workspace, 'data.db'))).toEqual(true);
  });

  test('performs restore with images', async () => {
    const io = createIo();
    const mountPoint = join(tmpDir, 'usb');
    mkdirSync(mountPoint, { recursive: true });
    createBackupDir(mountPoint, 'election-images', {
      electionTitle: 'Image Restore Test',
      images: [
        { relPath: 'batch1/img1.jpg', content: 'image-1' },
        { relPath: 'batch1/img2.jpg', content: 'image-2' },
      ],
    });

    const workspace = join(tmpDir, 'restore-workspace');
    mkdirSync(workspace, { recursive: true });

    const code = await main(
      argv('restore', '--workspace', workspace, '--mount-point', mountPoint),
      io
    );
    expect(code).toEqual(0);

    expect(
      existsSync(join(workspace, 'ballot-images', 'batch1', 'img1.jpg'))
    ).toEqual(true);
    expect(
      existsSync(join(workspace, 'ballot-images', 'batch1', 'img2.jpg'))
    ).toEqual(true);
  });

  test('reports error for tampered backup during restore', async () => {
    const io = createIo();
    const mountPoint = join(tmpDir, 'usb');
    mkdirSync(mountPoint, { recursive: true });
    const backupDir = createBackupDir(mountPoint, 'election-tampered');

    const manifestPath = join(backupDir, MANIFEST_FILENAME);
    const original = readFileSync(manifestPath, 'utf-8');
    writeFileSync(
      manifestPath,
      original.replace('General Election', 'TAMPERED'),
      'utf-8'
    );

    const workspace = join(tmpDir, 'restore-workspace');
    mkdirSync(workspace, { recursive: true });

    const code = await main(
      argv('restore', '--workspace', workspace, '--mount-point', mountPoint),
      io
    );
    expect(code).toEqual(1);
    expect(io.stderr.toString()).toContain('signature is invalid');
  });
});

describe('backup then restore round-trip', () => {
  test('backs up and restores data correctly', async () => {
    const { path: workspace } = createTestWorkspace(join(tmpDir, 'workspace'));
    addBallotImageToWorkspace(workspace, 'scan-data-1', 'cvr-rt', 'front');

    const mountPoint = join(tmpDir, 'usb');
    mkdirSync(mountPoint, { recursive: true });

    // Backup
    const backupIo = createIo();
    const backupCode = await main(
      argv('backup', '--workspace', workspace, '--mount-point', mountPoint),
      backupIo
    );
    expect(backupCode).toEqual(0);

    // Find the backup directory name
    const backupRootPath = join(mountPoint, BACKUP_ROOT_DIR);
    const backupDirs = readdirSync(backupRootPath);
    const backupDirName = assertDefined(backupDirs[0]);
    const backupDir = join(backupRootPath, backupDirName);

    // Validate the backup
    const validateIo = createIo();
    const validateCode = await main(argv('validate', backupDir), validateIo);
    expect(validateCode).toEqual(0);

    // List should show it
    const listIo = createIo();
    const listCode = await main(argv('list', mountPoint), listIo);
    expect(listCode).toEqual(0);
    expect(listIo.stdout.toString()).toContain('1 backup(s)');

    // Restore to a new workspace — no --backup-dir needed, auto-detected
    const restoreWorkspace = join(tmpDir, 'restored');
    mkdirSync(restoreWorkspace, { recursive: true });

    const restoreIo = createIo();
    const restoreCode = await main(
      argv(
        'restore',
        '--workspace',
        restoreWorkspace,
        '--mount-point',
        mountPoint
      ),
      restoreIo
    );
    expect(restoreCode).toEqual(0);

    // Verify restored database exists and contains data
    expect(existsSync(join(restoreWorkspace, 'data.db'))).toEqual(true);
    const restoredLogger = mockBaseLogger({ fn: vi.fn });
    const restoredClient = DbClient.fileClient(
      join(restoreWorkspace, 'data.db'),
      restoredLogger
    );
    const settings = restoredClient.one(
      'select current_election_id as currentElectionId from settings'
    ) as { currentElectionId: string | null };
    expect(settings.currentElectionId).toBeDefined();

    // Verify restored images — find the image file under ballot-images/
    const restoredImagesRoot = join(restoreWorkspace, 'ballot-images');
    const subdirs = readdirSync(restoredImagesRoot);
    expect(subdirs.length).toBeGreaterThan(0);
    const imageFiles = readdirSync(
      join(restoredImagesRoot, assertDefined(subdirs[0]))
    );
    expect(imageFiles).toContain('cvr-rt-front');
    expect(
      readFileSync(
        join(restoredImagesRoot, assertDefined(subdirs[0]), 'cvr-rt-front'),
        'utf-8'
      )
    ).toEqual('scan-data-1');
  });
});

describe('SIGINT cancellation', () => {
  test('backup surfaces non-cancellation errors', async () => {
    const io = createIo();
    const { path: workspace } = createTestWorkspace(join(tmpDir, 'workspace'));
    const mountPoint = join(tmpDir, 'usb');
    mkdirSync(mountPoint, { recursive: true });

    const backupModule = await import('./backup.js');
    vi.spyOn(backupModule, 'performBackup').mockRejectedValue(
      new Error('Disk full')
    );

    const code = await main(
      argv('backup', '--workspace', workspace, '--mount-point', mountPoint),
      io
    );
    expect(code).toEqual(1);
    expect(io.stderr.toString()).toContain('Disk full');
  });

  test('restore surfaces non-cancellation errors', async () => {
    const io = createIo();
    const mountPoint = join(tmpDir, 'usb');
    mkdirSync(mountPoint, { recursive: true });
    createBackupDir(mountPoint, 'election-err');
    const workspace = join(tmpDir, 'restore-workspace');
    mkdirSync(workspace, { recursive: true });

    const restoreModule = await import('./restore.js');
    vi.spyOn(restoreModule, 'performRestore').mockRejectedValue(
      new Error('Hash mismatch')
    );

    const code = await main(
      argv('restore', '--workspace', workspace, '--mount-point', mountPoint),
      io
    );
    expect(code).toEqual(1);
    expect(io.stderr.toString()).toContain('Hash mismatch');
  });

  test('restore validates workspace exists', async () => {
    const io = createIo();
    const mountPoint = join(tmpDir, 'usb');
    mkdirSync(mountPoint, { recursive: true });
    const code = await main(
      argv(
        'restore',
        '--workspace',
        '/nonexistent/ws',
        '--mount-point',
        mountPoint
      ),
      io
    );
    expect(code).toEqual(1);
    expect(io.stderr.toString()).toContain('Workspace does not exist');
  });

  test('backup returns 130 when cancelled', async () => {
    const io = createIo();
    const { path: workspace } = createTestWorkspace(join(tmpDir, 'workspace'));
    const mountPoint = join(tmpDir, 'usb');
    mkdirSync(mountPoint, { recursive: true });

    const backupModule = await import('./backup.js');
    vi.spyOn(backupModule, 'performBackup').mockRejectedValue(
      new Error('Backup was cancelled')
    );

    const code = await main(
      argv('backup', '--workspace', workspace, '--mount-point', mountPoint),
      io
    );
    expect(code).toEqual(130);
    expect(io.stdout.toString()).toContain('Backup cancelled');
  });

  test('restore returns 130 when cancelled', async () => {
    const io = createIo();
    const mountPoint = join(tmpDir, 'usb');
    mkdirSync(mountPoint, { recursive: true });
    createBackupDir(mountPoint, 'election-cancel');

    const workspace = join(tmpDir, 'restore-workspace');
    mkdirSync(workspace, { recursive: true });

    const restoreModule = await import('./restore.js');
    vi.spyOn(restoreModule, 'performRestore').mockRejectedValue(
      new Error('Restore was cancelled')
    );

    const code = await main(
      argv('restore', '--workspace', workspace, '--mount-point', mountPoint),
      io
    );
    expect(code).toEqual(130);
    expect(io.stdout.toString()).toContain('Restore cancelled');
  });
});

describe('error resilience', () => {
  test('handles corrupt manifest JSON gracefully', async () => {
    const io = createIo();
    const mountPoint = join(tmpDir, 'drive');
    mkdirSync(mountPoint, { recursive: true });
    const backupDir = createBackupDir(mountPoint, 'election-corrupt');

    writeFileSync(
      join(backupDir, MANIFEST_FILENAME),
      'not valid json {{{',
      'utf-8'
    );
    writeFileSync(
      join(backupDir, MANIFEST_SIGNATURE_FILENAME),
      signManifest('not valid json {{{')
    );

    const code = await main(argv('validate', backupDir), io);
    expect(code).toEqual(1);
  });

  test('handles missing manifest signature file', async () => {
    const io = createIo();
    const mountPoint = join(tmpDir, 'drive');
    const backupRoot = join(mountPoint, BACKUP_ROOT_DIR);
    mkdirSync(backupRoot, { recursive: true });
    const backupDir = join(backupRoot, 'no-sig');
    mkdirSync(backupDir, { recursive: true });
    writeFileSync(join(backupDir, MANIFEST_FILENAME), '{}', 'utf-8');

    const code = await main(argv('validate', backupDir), io);
    expect(code).toEqual(1);
  });

  test('list handles directories with corrupt manifests gracefully', async () => {
    const io = createIo();
    const mountPoint = join(tmpDir, 'drive');
    const backupRoot = join(mountPoint, BACKUP_ROOT_DIR);
    mkdirSync(backupRoot, { recursive: true });

    const corruptDir = join(backupRoot, 'corrupt-backup');
    mkdirSync(corruptDir, { recursive: true });
    writeFileSync(join(corruptDir, MANIFEST_FILENAME), 'bad json', 'utf-8');

    createBackupDir(mountPoint, 'good-backup', {
      electionTitle: 'Good One',
    });

    const code = await main(argv('list', mountPoint), io);
    expect(code).toEqual(0);
    expect(io.stdout.toString()).toContain('1 backup(s)');
  });
});
