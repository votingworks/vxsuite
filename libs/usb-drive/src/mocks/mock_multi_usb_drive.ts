import { Mocked, mockFunction } from '@votingworks/test-utils';
import { makeTemporaryDirectory } from '@votingworks/fixtures';
import { rmSync } from 'node:fs';
import {
  MultiUsbDrive,
  UsbDriveFilesystemType,
  UsbDriveInfo,
} from '../multi_usb_drive';
import { MockFileTree, writeMockFileTree } from './helpers';

const MOCK_SINGLETON_DISK_DEV_PATH = '/dev/sdb';

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
    options?: { devPath: string; fstype?: UsbDriveFilesystemType }
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
    options: { devPath: string; fstype?: UsbDriveFilesystemType }
  ) {
    const fstype = options.fstype ?? 'fat32';
    const mountPoint = makeTemporaryDirectory();
    mockUsbTmpDirs.push(mountPoint);
    writeMockFileTree(mountPoint, contents);
    drives.push({
      devPath: options.devPath,
      vendor: undefined,
      model: undefined,
      serial: undefined,
      partitions: [
        {
          devPath: `${options.devPath}1`,
          label: 'VxUSB-ABCDE',
          fstype: fstype === 'ext4' ? 'ext4' : 'vfat',
          fsver: fstype === 'ext4' ? '1.0' : 'FAT32',
          mount: { type: 'mounted', mountPoint },
        },
      ],
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
        devPath: MOCK_SINGLETON_DISK_DEV_PATH,
      });
    },

    removeAll,
  };
}
