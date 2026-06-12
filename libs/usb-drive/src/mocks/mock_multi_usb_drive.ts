import { Mocked, mockFunction } from '@votingworks/test-utils';
import { makeTemporaryDirectory } from '@votingworks/fixtures';
import { rmSync } from 'node:fs';
import { MultiUsbDrive, UsbDriveFilesystemType } from '../multi_usb_drive';
import { MockFileTree, writeMockFileTree } from './helpers';
import {
  UsbDiskDevPath,
  UsbDiskDevPathSchema,
  UsbDriveInfo,
  UsbPartitionDevPathSchema,
  UsbPartitionMount,
  UsbPartitionMountpointSchema,
} from '../types';

const MOCK_SINGLETON_DISK_DEV_PATH = UsbDiskDevPathSchema.parse('/dev/sdb');

export interface MockMultiUsbDrive {
  multiUsbDrive: Mocked<MultiUsbDrive>;
  assertComplete(): void;

  /**
   * Simulates adding a new mounted USB drive alongside whatever is already
   * plugged in. Requires specifying the `devPath` so that it does not conflict
   * with existing drives. Defaults to FAT32.
   */
  addUsbDrive(
    contents: MockFileTree,
    options?: { diskPath: UsbDiskDevPath; fstype?: UsbDriveFilesystemType }
  ): void;

  /**
   * Simulates removing all existing USB drives and inserting a new mounted
   * drive with the given file contents. Defaults to FAT32.
   */
  insertUsbDrive(
    contents: MockFileTree,
    options?: { fstype?: UsbDriveFilesystemType }
  ): void;

  /**
   * Simulates removing all USB drives.
   */
  removeAll(): void;
}

/**
 * Creates a mock of the MultiUsbDrive interface. Each method is mocked with a
 * mockFunction (see @votingworks/test-utils).
 *
 * Also has methods to add or remove mock USB drives backed by a filesystem
 * directory. If using this interface, getDrives will automatically return the
 * correct state.
 */
export function createMockMultiUsbDrive(): MockMultiUsbDrive {
  const mockUsbTmpDirs: string[] = [];

  const multiUsbDrive: Mocked<MultiUsbDrive> = {
    getDrives: mockFunction('getDrives'),
    refresh: mockFunction('refresh'),
    ejectDrive: mockFunction('ejectDrive'),
    formatDrive: mockFunction('formatDrive'),
    sync: mockFunction('sync'),
    stop: mockFunction('stop'),
    addListener: mockFunction('addListener'),
    removeListener: mockFunction('removeListener'),
  };

  // Initialize with no drive connected
  const drives: UsbDriveInfo[] = [];
  multiUsbDrive.getDrives.expectRepeatedCallsWith().returns(drives);

  function addUsbDrive(
    contents: MockFileTree,
    options: { diskPath: UsbDiskDevPath; fstype?: UsbDriveFilesystemType }
  ) {
    const fstype = options.fstype ?? 'fat32';
    const mountpoint = makeTemporaryDirectory();
    mockUsbTmpDirs.push(mountpoint);
    writeMockFileTree(mountpoint, contents);
    const diskPath = UsbDiskDevPathSchema.parse(options.diskPath);
    drives.push({
      diskPath,
      partition: {
        diskPath,
        partPath: UsbPartitionDevPathSchema.parse(`${options.diskPath}1`),
        label: 'VxUSB-ABCDE',
        fstype,
        mount: UsbPartitionMount.mounted(
          UsbPartitionMountpointSchema.parse(mountpoint)
        ),
      },
    });
    multiUsbDrive.getDrives.reset();
    multiUsbDrive.getDrives.expectRepeatedCallsWith().returns(drives);
  }

  function removeAll() {
    drives.length = 0;
    multiUsbDrive.getDrives.reset();
    multiUsbDrive.getDrives.expectRepeatedCallsWith().returns(drives);

    const tmpdirs = [...mockUsbTmpDirs];
    mockUsbTmpDirs.length = 0;
    for (const tmpdir of tmpdirs) {
      rmSync(tmpdir, { recursive: true });
    }
  }

  return {
    multiUsbDrive,

    assertComplete() {
      for (const method of Object.values(multiUsbDrive)) {
        method.assertComplete();
      }
    },

    addUsbDrive,

    insertUsbDrive(
      contents: MockFileTree,
      options?: { fstype?: UsbDriveFilesystemType }
    ) {
      removeAll();
      addUsbDrive(contents, {
        ...(options ?? {}),
        diskPath: MOCK_SINGLETON_DISK_DEV_PATH,
      });
    },

    removeAll,
  };
}
