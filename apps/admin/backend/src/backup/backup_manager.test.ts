import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test, vi, afterEach } from 'vitest';
import { assertDefined, sleep } from '@votingworks/basics';
import { mockBaseLogger } from '@votingworks/logging';
import { makeTemporaryDirectory } from '@votingworks/fixtures';
import {
  createMockMultiUsbDrive,
  MockMultiUsbDrive,
} from '@votingworks/usb-drive';
import { UsbDriveInfo } from '@votingworks/usb-drive';

import { BackupManager } from './backup_manager';
import {
  BACKUP_ROOT_DIR,
  BackupManifest,
  MANIFEST_FILENAME,
  MANIFEST_SIGNATURE_FILENAME,
} from './types';
import { signManifest } from './signing';

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

function createTestBackupManager(mockDrive: MockMultiUsbDrive) {
  const workspacePath = makeTemporaryDirectory();
  const dbPath = join(workspacePath, 'data.db');
  writeFileSync(dbPath, 'test');
  mkdirSync(join(workspacePath, 'ballot-images'), { recursive: true });
  const logger = mockBaseLogger({ fn: vi.fn });
  const backupDatabase = vi.fn();

  const manager = new BackupManager(
    () => workspacePath,
    () => dbPath,
    () => join(workspacePath, 'ballot-images'),
    backupDatabase,
    logger,
    mockDrive.multiUsbDrive
  );

  return { manager, workspacePath, backupDatabase };
}

function createValidBackup(mountPoint: string, dirName: string): void {
  const backupDir = join(mountPoint, BACKUP_ROOT_DIR, dirName);
  mkdirSync(backupDir, { recursive: true });
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
  writeFileSync(join(backupDir, MANIFEST_FILENAME), manifestJson);
  writeFileSync(
    join(backupDir, MANIFEST_SIGNATURE_FILENAME),
    signManifest(manifestJson)
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('BackupManager', () => {
  test('getStatus returns idle initially', () => {
    const mockDrive = createMockMultiUsbDrive();
    const { manager } = createTestBackupManager(mockDrive);
    expect(manager.getStatus()).toEqual({ type: 'idle' });
  });

  test('getBackupDrives returns empty when no drives', () => {
    const mockDrive = createMockMultiUsbDrive();
    const { manager } = createTestBackupManager(mockDrive);
    expect(manager.getBackupDrives()).toEqual([]);
  });

  test('getBackupDrives detects ext4 drive with backup root', () => {
    const mockDrive = createMockMultiUsbDrive();
    const mountPoint = makeTemporaryDirectory();
    mkdirSync(join(mountPoint, BACKUP_ROOT_DIR), { recursive: true });

    mockDrive.multiUsbDrive.getDrives.reset();
    mockDrive.multiUsbDrive.getDrives
      .expectRepeatedCallsWith()
      .returns(mountedExt4Drive(mountPoint));

    const { manager } = createTestBackupManager(mockDrive);
    const drives = manager.getBackupDrives();
    expect(drives.length).toEqual(1);
    const drive = assertDefined(drives[0]);
    expect(drive.isBackupDrive).toEqual(true);
    expect(drive.mountPoint).toEqual(mountPoint);
  });

  test('listBackups returns cached backups for a drive', () => {
    const mockDrive = createMockMultiUsbDrive();
    const mountPoint = makeTemporaryDirectory();
    createValidBackup(mountPoint, 'test-election');

    mockDrive.multiUsbDrive.getDrives.reset();
    mockDrive.multiUsbDrive.getDrives
      .expectRepeatedCallsWith()
      .returns(mountedExt4Drive(mountPoint));

    const { manager } = createTestBackupManager(mockDrive);
    const backups = manager.listBackups(mountPoint);
    expect(backups.length).toEqual(1);
    expect(assertDefined(backups[0]).electionTitle).toEqual('Test');
  });

  test('listBackups returns empty for unknown mount point', () => {
    const mockDrive = createMockMultiUsbDrive();
    const { manager } = createTestBackupManager(mockDrive);
    expect(manager.listBackups('/nonexistent')).toEqual([]);
  });

  test('onStatusChange notifies and can unsubscribe', () => {
    const mockDrive = createMockMultiUsbDrive();
    const { manager } = createTestBackupManager(mockDrive);
    const listener = vi.fn();

    const unsubscribe = manager.onStatusChange(listener);
    manager.cancelBackup(); // no-op when idle
    expect(listener).not.toHaveBeenCalled();

    unsubscribe();
  });

  test('startBackup transitions through running to error on failure', async () => {
    const mockDrive = createMockMultiUsbDrive();
    const mountPoint = makeTemporaryDirectory();
    mkdirSync(join(mountPoint, BACKUP_ROOT_DIR), { recursive: true });

    mockDrive.multiUsbDrive.getDrives.reset();
    mockDrive.multiUsbDrive.getDrives
      .expectRepeatedCallsWith()
      .returns(mountedExt4Drive(mountPoint));

    const { manager } = createTestBackupManager(mockDrive);
    const statusChanges: string[] = [];
    manager.onStatusChange(() => {
      statusChanges.push(manager.getStatus().type);
    });

    // Will fail because the db path is a plain text file, not a real database
    await manager.startBackup(
      'manual',
      mountPoint,
      'e1',
      'Test',
      '2026-01-01',
      'test-election',
      'VX-001',
      'dev'
    );

    expect(statusChanges).toContain('running');
    expect(statusChanges).toContain('error');
  });

  test('startBackup rejects when already running', async () => {
    const mockDrive = createMockMultiUsbDrive();
    const mountPoint = makeTemporaryDirectory();
    mkdirSync(join(mountPoint, BACKUP_ROOT_DIR), { recursive: true });

    mockDrive.multiUsbDrive.getDrives.reset();
    mockDrive.multiUsbDrive.getDrives
      .expectRepeatedCallsWith()
      .returns(mountedExt4Drive(mountPoint));

    const { manager } = createTestBackupManager(mockDrive);

    // Start first backup (will eventually fail, but we catch second call while running)
    const first = manager.startBackup(
      'manual',
      mountPoint,
      'e1',
      'Test',
      '2026-01-01',
      'test',
      'VX-001',
      'dev'
    );

    // Immediately try to start another
    await expect(
      manager.startBackup(
        'manual',
        mountPoint,
        'e2',
        'Test2',
        '2026-01-01',
        'test2',
        'VX-001',
        'dev'
      )
    ).rejects.toThrow('already in progress');

    await first;
  });

  test('refreshDriveCacheIfStale refreshes when drives change', () => {
    const mockDrive = createMockMultiUsbDrive();
    const mountPoint1 = makeTemporaryDirectory();
    mkdirSync(join(mountPoint1, BACKUP_ROOT_DIR), { recursive: true });

    mockDrive.multiUsbDrive.getDrives.reset();
    mockDrive.multiUsbDrive.getDrives
      .expectRepeatedCallsWith()
      .returns(mountedExt4Drive(mountPoint1));

    const { manager } = createTestBackupManager(mockDrive);
    expect(manager.getBackupDrives().length).toEqual(1);

    // Simulate drive removed
    const mountPoint2 = makeTemporaryDirectory();
    mockDrive.multiUsbDrive.getDrives.reset();
    mockDrive.multiUsbDrive.getDrives
      .expectRepeatedCallsWith()
      .returns(mountedExt4Drive(mountPoint2, '/dev/sdc'));

    // getBackupDrives triggers staleness check
    const drives = manager.getBackupDrives();
    expect(drives.length).toEqual(1);
    expect(assertDefined(drives[0]).mountPoint).toEqual(mountPoint2);
  });

  test('startBackup transitions to success when backup succeeds', async () => {
    const mockDrive = createMockMultiUsbDrive();
    const mountPoint = makeTemporaryDirectory();
    mkdirSync(join(mountPoint, BACKUP_ROOT_DIR), { recursive: true });

    mockDrive.multiUsbDrive.getDrives.reset();
    mockDrive.multiUsbDrive.getDrives
      .expectRepeatedCallsWith()
      .returns(mountedExt4Drive(mountPoint));

    const { manager } = createTestBackupManager(mockDrive);

    // Mock performBackup to succeed
    const backupModule = await import('./backup.js');
    vi.spyOn(backupModule, 'performBackup').mockResolvedValue();

    await manager.startBackup(
      'manual',
      mountPoint,
      'e1',
      'Test',
      '2026-01-01',
      'test',
      'VX-001',
      'dev'
    );

    expect(manager.getStatus().type).toEqual('success');
  });

  test('startBackup transitions to idle when cancelled', async () => {
    const mockDrive = createMockMultiUsbDrive();
    const mountPoint = makeTemporaryDirectory();
    mkdirSync(join(mountPoint, BACKUP_ROOT_DIR), { recursive: true });

    mockDrive.multiUsbDrive.getDrives.reset();
    mockDrive.multiUsbDrive.getDrives
      .expectRepeatedCallsWith()
      .returns(mountedExt4Drive(mountPoint));

    const { manager } = createTestBackupManager(mockDrive);

    const backupModule = await import('./backup.js');
    vi.spyOn(backupModule, 'performBackup').mockRejectedValue(
      new Error('Backup was cancelled')
    );

    await manager.startBackup(
      'manual',
      mountPoint,
      'e1',
      'Test',
      '2026-01-01',
      'test',
      'VX-001',
      'dev'
    );

    expect(manager.getStatus().type).toEqual('idle');
  });

  test('cancelBackup aborts when running', async () => {
    const mockDrive = createMockMultiUsbDrive();
    const mountPoint = makeTemporaryDirectory();
    mkdirSync(join(mountPoint, BACKUP_ROOT_DIR), { recursive: true });

    mockDrive.multiUsbDrive.getDrives.reset();
    mockDrive.multiUsbDrive.getDrives
      .expectRepeatedCallsWith()
      .returns(mountedExt4Drive(mountPoint));

    const { manager } = createTestBackupManager(mockDrive);

    let capturedSignal: AbortSignal | undefined;
    const backupModule = await import('./backup.js');
    vi.spyOn(backupModule, 'performBackup').mockImplementation(async (ctx) => {
      capturedSignal = ctx.signal;
      await sleep(50);
    });

    const backupPromise = manager.startBackup(
      'manual',
      mountPoint,
      'e1',
      'Test',
      '2026-01-01',
      'test',
      'VX-001',
      'dev'
    );

    // Cancel while running
    manager.cancelBackup();
    expect(capturedSignal?.aborted).toEqual(true);

    await backupPromise;
  });

  test('restore delegates to performRestore', async () => {
    const mockDrive = createMockMultiUsbDrive();
    const mountPoint = makeTemporaryDirectory();
    createValidBackup(mountPoint, 'test-backup');

    mockDrive.multiUsbDrive.getDrives.reset();
    mockDrive.multiUsbDrive.getDrives
      .expectRepeatedCallsWith()
      .returns(mountedExt4Drive(mountPoint));

    const { manager } = createTestBackupManager(mockDrive);

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

    const restoreModule = await import('./restore.js');
    vi.spyOn(restoreModule, 'performRestore').mockResolvedValue(
      expectedManifest
    );

    const result = await manager.restore(mountPoint, 'test-backup', 'dev');
    expect(result).toEqual(expectedManifest);
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

    const { manager } = createTestBackupManager(mockDrive);
    await manager.designateBackupDrive('/dev/sdb');

    const drives = manager.getBackupDrives();
    expect(drives.length).toEqual(1);
    expect(assertDefined(drives[0]).isBackupDrive).toEqual(true);
  });

  test('designateBackupDrive creates backup root on mounted ext4', async () => {
    const mockDrive = createMockMultiUsbDrive();
    const mountPoint = makeTemporaryDirectory();

    mockDrive.multiUsbDrive.getDrives.reset();
    mockDrive.multiUsbDrive.getDrives
      .expectRepeatedCallsWith()
      .returns(mountedExt4Drive(mountPoint));

    const { manager } = createTestBackupManager(mockDrive);
    await manager.designateBackupDrive('/dev/sdb');

    const drives = manager.getBackupDrives();
    expect(drives.length).toEqual(1);
    expect(assertDefined(drives[0]).isBackupDrive).toEqual(true);
  });
});
