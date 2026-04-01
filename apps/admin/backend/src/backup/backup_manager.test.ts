import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Buffer } from 'node:buffer';
import { describe, expect, test, vi, afterEach } from 'vitest';
import { assertDefined, err, ok, sleep } from '@votingworks/basics';
import { mockBaseLogger } from '@votingworks/logging';
import { makeTemporaryDirectory } from '@votingworks/fixtures';
import {
  createMockMultiUsbDrive,
  type UsbDriveInfo,
  MockMultiUsbDrive,
} from '@votingworks/usb-drive';

import { BackupManager } from './backup_manager';
import * as backupModule from './backup';
import * as restoreModule from './restore';
import {
  BACKUP_DB_FILENAME,
  BACKUP_ROOT_DIR,
  BackupManifest,
  MANIFEST_FILENAME,
  MANIFEST_SIGNATURE_FILENAME,
} from './types';
import { signManifest } from './signing';
import {
  WORKSPACE_BALLOT_IMAGES_DIR,
  WORKSPACE_DB_FILENAME,
} from '../util/workspace';

function mountedExt4Drive(
  mountPoint: string,
  devPath = '/dev/sdb'
): UsbDriveInfo[] {
  return [
    {
      devPath,
      partitions: [
        {
          devPath: `${devPath}1`,
          fstype: 'ext4',
          fsver: '1.0',
          mount: { type: 'mounted', mountPoint },
        },
      ],
    },
  ];
}

async function createTestBackupManager(mockDrive: MockMultiUsbDrive) {
  const workspacePath = makeTemporaryDirectory();
  const dbPath = join(workspacePath, WORKSPACE_DB_FILENAME);
  await writeFile(dbPath, 'test');
  const ballotImagesPath = join(workspacePath, WORKSPACE_BALLOT_IMAGES_DIR);
  await mkdir(ballotImagesPath, { recursive: true });
  const logger = mockBaseLogger({ fn: vi.fn });
  const backupDatabase = vi.fn();

  const manager = BackupManager.create(
    () => workspacePath,
    () => dbPath,
    () => ballotImagesPath,
    backupDatabase,
    logger,
    mockDrive.multiUsbDrive
  );
  await manager.refreshDriveCache();

  return { manager, workspacePath, backupDatabase };
}

async function createValidBackup(
  mountPoint: string,
  dirName: string
): Promise<void> {
  const backupDir = join(mountPoint, BACKUP_ROOT_DIR, dirName);
  await mkdir(backupDir, { recursive: true });
  const manifest: BackupManifest = {
    version: 1,
    electionId: 'e1',
    electionTitle: 'Test',
    electionDate: '2026-01-01',
    machineId: 'VX-001',
    softwareVersion: 'dev',
    createdAt: '2026-01-01T00:00:00.000Z',
    files: [],
  };
  const manifestJson = JSON.stringify(manifest);
  await writeFile(join(backupDir, MANIFEST_FILENAME), manifestJson);
  await writeFile(
    join(backupDir, MANIFEST_SIGNATURE_FILENAME),
    signManifest(manifestJson)
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('BackupManager', () => {
  test('getStatus returns idle initially', async () => {
    const mockDrive = createMockMultiUsbDrive();
    const { manager } = await createTestBackupManager(mockDrive);
    expect(manager.getStatus()).toEqual({ type: 'idle' });
  });

  test('getBackupDrives returns empty when no drives', async () => {
    const mockDrive = createMockMultiUsbDrive();
    const { manager } = await createTestBackupManager(mockDrive);
    expect(await manager.getBackupDrives()).toEqual([]);
  });

  test('getBackupDrives detects ext4 drive with backup root', async () => {
    const mockDrive = createMockMultiUsbDrive();
    const mountPoint = makeTemporaryDirectory();
    await mkdir(join(mountPoint, BACKUP_ROOT_DIR), { recursive: true });

    mockDrive.multiUsbDrive.getDrives.reset();
    mockDrive.multiUsbDrive.getDrives
      .expectRepeatedCallsWith()
      .returns(mountedExt4Drive(mountPoint));

    const { manager } = await createTestBackupManager(mockDrive);
    const drives = await manager.getBackupDrives();
    expect(drives.length).toEqual(1);
    const drive = assertDefined(drives[0]);
    expect(drive.isBackupDrive).toEqual(true);
    expect(drive.mountPoint).toEqual(mountPoint);
  });

  test('listBackups returns cached backups for a drive', async () => {
    const mockDrive = createMockMultiUsbDrive();
    const mountPoint = makeTemporaryDirectory();
    await createValidBackup(mountPoint, 'test-election');

    mockDrive.multiUsbDrive.getDrives.reset();
    mockDrive.multiUsbDrive.getDrives
      .expectRepeatedCallsWith()
      .returns(mountedExt4Drive(mountPoint));

    const { manager } = await createTestBackupManager(mockDrive);
    const backups = manager.listBackups(mountPoint);
    expect(backups.length).toEqual(1);
    expect(assertDefined(backups[0]).electionTitle).toEqual('Test');
  });

  test('listBackups returns empty for unknown mount point', async () => {
    const mockDrive = createMockMultiUsbDrive();
    const { manager } = await createTestBackupManager(mockDrive);
    expect(manager.listBackups('/nonexistent')).toEqual([]);
  });

  test('onStatusChange notifies and can unsubscribe', async () => {
    const mockDrive = createMockMultiUsbDrive();
    const { manager } = await createTestBackupManager(mockDrive);
    const listener = vi.fn();

    const unsubscribe = manager.onStatusChange(listener);
    manager.cancelBackup(); // no-op when idle
    expect(listener).not.toHaveBeenCalled();

    unsubscribe();
  });

  test('startBackup transitions through running to error on failure', async () => {
    const mockDrive = createMockMultiUsbDrive();
    const mountPoint = makeTemporaryDirectory();
    await mkdir(join(mountPoint, BACKUP_ROOT_DIR), { recursive: true });

    mockDrive.multiUsbDrive.getDrives.reset();
    mockDrive.multiUsbDrive.getDrives
      .expectRepeatedCallsWith()
      .returns(mountedExt4Drive(mountPoint));

    const { manager } = await createTestBackupManager(mockDrive);
    vi.spyOn(backupModule, 'performBackup').mockResolvedValue(
      err({ type: 'error', error: new Error('backup failed') })
    );

    const statusChanges: string[] = [];
    manager.onStatusChange(() => {
      statusChanges.push(manager.getStatus().type);
    });

    manager.startBackup('manual', mountPoint, 'VX-001', 'dev').unsafeUnwrap();
    await manager.waitForCurrentOperation();

    expect(statusChanges).toContain('running');
    expect(statusChanges).toContain('error');
  });

  test('startBackup rejects when already running', async () => {
    const mockDrive = createMockMultiUsbDrive();
    const mountPoint = makeTemporaryDirectory();
    await mkdir(join(mountPoint, BACKUP_ROOT_DIR), { recursive: true });

    mockDrive.multiUsbDrive.getDrives.reset();
    mockDrive.multiUsbDrive.getDrives
      .expectRepeatedCallsWith()
      .returns(mountedExt4Drive(mountPoint));

    const { manager } = await createTestBackupManager(mockDrive);

    // Start first backup (will eventually fail, but we catch second call while running)
    vi.spyOn(backupModule, 'performBackup').mockImplementation(async () => {
      await sleep(50);
      return ok();
    });

    const firstResult = manager.startBackup(
      'manual',
      mountPoint,
      'VX-001',
      'dev'
    );
    firstResult.unsafeUnwrap();

    // Immediately try to start another
    expect(manager.startBackup('manual', mountPoint, 'VX-001', 'dev')).toEqual(
      err({ type: 'alreadyRunning' })
    );

    await manager.waitForCurrentOperation();
  });

  test('refreshDriveCacheIfStale refreshes when drives change', async () => {
    const mockDrive = createMockMultiUsbDrive();
    const mountPoint1 = makeTemporaryDirectory();
    await mkdir(join(mountPoint1, BACKUP_ROOT_DIR), { recursive: true });

    mockDrive.multiUsbDrive.getDrives.reset();
    mockDrive.multiUsbDrive.getDrives
      .expectRepeatedCallsWith()
      .returns(mountedExt4Drive(mountPoint1));

    const { manager } = await createTestBackupManager(mockDrive);
    expect(await manager.getBackupDrives()).toHaveLength(1);

    // Simulate drive removed
    const mountPoint2 = makeTemporaryDirectory();
    await mkdir(join(mountPoint2, BACKUP_ROOT_DIR), { recursive: true });
    mockDrive.multiUsbDrive.getDrives.reset();
    mockDrive.multiUsbDrive.getDrives
      .expectRepeatedCallsWith()
      .returns(mountedExt4Drive(mountPoint2, '/dev/sdc'));

    // getBackupDrives triggers staleness check
    const drives = await manager.getBackupDrives();
    expect(drives.length).toEqual(1);
    expect(assertDefined(drives[0]).mountPoint).toEqual(mountPoint2);
  });

  test('startBackup transitions to success when backup succeeds', async () => {
    const mockDrive = createMockMultiUsbDrive();
    const mountPoint = makeTemporaryDirectory();
    await mkdir(join(mountPoint, BACKUP_ROOT_DIR), { recursive: true });

    mockDrive.multiUsbDrive.getDrives.reset();
    mockDrive.multiUsbDrive.getDrives
      .expectRepeatedCallsWith()
      .returns(mountedExt4Drive(mountPoint));

    const { manager } = await createTestBackupManager(mockDrive);

    // Mock performBackup to succeed
    vi.spyOn(backupModule, 'performBackup').mockResolvedValue(ok());

    manager.startBackup('manual', mountPoint, 'VX-001', 'dev').unsafeUnwrap();
    await manager.waitForCurrentOperation();

    expect(manager.getStatus().type).toEqual('success');
  });

  test('startBackup transitions to idle when cancelled', async () => {
    const mockDrive = createMockMultiUsbDrive();
    const mountPoint = makeTemporaryDirectory();
    await mkdir(join(mountPoint, BACKUP_ROOT_DIR), { recursive: true });

    mockDrive.multiUsbDrive.getDrives.reset();
    mockDrive.multiUsbDrive.getDrives
      .expectRepeatedCallsWith()
      .returns(mountedExt4Drive(mountPoint));

    const { manager } = await createTestBackupManager(mockDrive);

    vi.spyOn(backupModule, 'performBackup').mockResolvedValue(
      err({ type: 'cancelled' })
    );

    manager.startBackup('manual', mountPoint, 'VX-001', 'dev').unsafeUnwrap();
    await manager.waitForCurrentOperation();

    expect(manager.getStatus().type).toEqual('idle');
  });

  test('startBackup formats invalid-manifest-signature errors', async () => {
    const mockDrive = createMockMultiUsbDrive();
    const mountPoint = makeTemporaryDirectory();
    await mkdir(join(mountPoint, BACKUP_ROOT_DIR), { recursive: true });

    mockDrive.multiUsbDrive.getDrives.reset();
    mockDrive.multiUsbDrive.getDrives
      .expectRepeatedCallsWith()
      .returns(mountedExt4Drive(mountPoint));

    const { manager } = await createTestBackupManager(mockDrive);

    vi.spyOn(backupModule, 'performBackup').mockResolvedValue(
      err({
        type: 'invalidManifestSignature',
        manifestJson: Buffer.from('{}'),
        signatureData: Buffer.from('sig'),
      })
    );

    manager.startBackup('manual', mountPoint, 'VX-001', 'dev').unsafeUnwrap();
    await manager.waitForCurrentOperation();

    expect(manager.getStatus()).toMatchObject({
      type: 'error',
      error: 'Backup manifest signature is invalid.',
    });
  });

  test('startBackup formats invalid-file-hash errors', async () => {
    const mockDrive = createMockMultiUsbDrive();
    const mountPoint = makeTemporaryDirectory();
    await mkdir(join(mountPoint, BACKUP_ROOT_DIR), { recursive: true });

    mockDrive.multiUsbDrive.getDrives.reset();
    mockDrive.multiUsbDrive.getDrives
      .expectRepeatedCallsWith()
      .returns(mountedExt4Drive(mountPoint));

    const { manager } = await createTestBackupManager(mockDrive);

    vi.spyOn(backupModule, 'performBackup').mockResolvedValue(
      err({
        type: 'invalidFileHash',
        path: BACKUP_DB_FILENAME,
        expected: 'expected-hash',
        actual: 'actual-hash',
      })
    );

    manager.startBackup('manual', mountPoint, 'VX-001', 'dev').unsafeUnwrap();
    await manager.waitForCurrentOperation();

    expect(manager.getStatus()).toMatchObject({
      type: 'error',
      error:
        'Hash mismatch for data.db: expected expected-hash, got actual-hash',
    });
  });

  test('startBackup formats mismatched version errors', async () => {
    const mockDrive = createMockMultiUsbDrive();
    const mountPoint = makeTemporaryDirectory();
    await mkdir(join(mountPoint, BACKUP_ROOT_DIR), { recursive: true });

    mockDrive.multiUsbDrive.getDrives.reset();
    mockDrive.multiUsbDrive.getDrives
      .expectRepeatedCallsWith()
      .returns(mountedExt4Drive(mountPoint));

    const { manager } = await createTestBackupManager(mockDrive);

    vi.spyOn(backupModule, 'performBackup').mockResolvedValue(
      err({
        type: 'mismatchedSoftwareVersion',
        expected: '2.0.0',
        actual: '1.0.0',
      })
    );

    manager.startBackup('manual', mountPoint, 'VX-001', 'dev').unsafeUnwrap();
    await manager.waitForCurrentOperation();

    expect(manager.getStatus()).toMatchObject({
      type: 'error',
      error:
        'Backup was created with software version 1.0.0, current version is 2.0.0.',
    });
  });

  test('cancelBackup aborts when running', async () => {
    const mockDrive = createMockMultiUsbDrive();
    const mountPoint = makeTemporaryDirectory();
    await mkdir(join(mountPoint, BACKUP_ROOT_DIR), { recursive: true });

    mockDrive.multiUsbDrive.getDrives.reset();
    mockDrive.multiUsbDrive.getDrives
      .expectRepeatedCallsWith()
      .returns(mountedExt4Drive(mountPoint));

    const { manager } = await createTestBackupManager(mockDrive);

    let capturedSignal: AbortSignal | undefined;
    vi.spyOn(backupModule, 'performBackup').mockImplementation(async (ctx) => {
      capturedSignal = ctx.signal;
      await sleep(50);
      return ok();
    });

    const startResult = manager.startBackup(
      'manual',
      mountPoint,
      'VX-001',
      'dev'
    );
    startResult.unsafeUnwrap();

    // Cancel while running
    manager.cancelBackup();
    expect(capturedSignal?.aborted).toEqual(true);

    await manager.waitForCurrentOperation();
  });

  test('restore delegates to performRestore', async () => {
    const mockDrive = createMockMultiUsbDrive();
    const mountPoint = makeTemporaryDirectory();
    await createValidBackup(mountPoint, 'test-backup');

    mockDrive.multiUsbDrive.getDrives.reset();
    mockDrive.multiUsbDrive.getDrives
      .expectRepeatedCallsWith()
      .returns(mountedExt4Drive(mountPoint));

    const { manager } = await createTestBackupManager(mockDrive);

    const expectedManifest: BackupManifest = {
      version: 1,
      electionId: 'e1',
      electionTitle: 'Test',
      electionDate: '2026-01-01',
      machineId: 'VX-001',
      softwareVersion: 'dev',
      createdAt: '2026-01-01T00:00:00.000Z',
      files: [],
    };

    vi.spyOn(restoreModule, 'performRestore').mockResolvedValue(
      ok(expectedManifest)
    );

    const result = await manager.restore(mountPoint, 'test-backup', 'dev');
    expect(result).toEqual(ok(expectedManifest));
  });

  test('designateBackupDrive formats non-ext4 drive then creates backup root', async () => {
    const mockDrive = createMockMultiUsbDrive();
    const mountPoint = makeTemporaryDirectory();

    // Initially no ext4 partition
    mockDrive.multiUsbDrive.getDrives.reset();
    mockDrive.multiUsbDrive.getDrives.expectCallWith().returns([
      {
        devPath: '/dev/sdb',
        partitions: [
          {
            devPath: '/dev/sdb1',
            fstype: 'vfat',
            fsver: 'FAT32',
            mount: { type: 'mounted', mountPoint },
          },
        ],
      },
    ]);

    // After format, getDrives returns ext4
    mockDrive.multiUsbDrive.formatDrive
      .expectCallWith('/dev/sdb', 'ext4')
      .resolves();
    mockDrive.multiUsbDrive.refresh.expectCallWith().resolves();
    mockDrive.multiUsbDrive.getDrives
      .expectRepeatedCallsWith()
      .returns(mountedExt4Drive(mountPoint));
    mockDrive.multiUsbDrive.waitForChange.expectCallWith().resolves();

    const { manager } = await createTestBackupManager(mockDrive);
    await manager.designateBackupDrive('/dev/sdb');

    const drives = await manager.getBackupDrives();
    expect(drives.length).toEqual(1);
    expect(assertDefined(drives[0]).isBackupDrive).toEqual(true);
  });

  test('designateBackupDrive creates backup root on mounted ext4', async () => {
    const mockDrive = createMockMultiUsbDrive();
    const mountPoint = makeTemporaryDirectory();
    await mkdir(join(mountPoint, BACKUP_ROOT_DIR), { recursive: true });

    mockDrive.multiUsbDrive.getDrives.reset();
    mockDrive.multiUsbDrive.getDrives
      .expectRepeatedCallsWith()
      .returns(mountedExt4Drive(mountPoint));

    const { manager } = await createTestBackupManager(mockDrive);
    await manager.designateBackupDrive('/dev/sdb');

    const drives = await manager.getBackupDrives();
    expect(drives.length).toEqual(1);
    expect(assertDefined(drives[0]).isBackupDrive).toEqual(true);
  });
});
