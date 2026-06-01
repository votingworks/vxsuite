import { Mocked, mockFunction } from '@votingworks/test-utils';
import { makeTemporaryDirectory } from '@votingworks/fixtures';
import {
  MultiUsbDrive,
  UsbDriveFilesystemType,
  UsbDriveInfo,
} from '../multi_usb_drive';
import { MockFileTree, writeMockFileTree } from './helpers';

const MOCK_DISK_DEV_PATH = '/dev/sdb';
const MOCK_PARTITION_DEV_PATH = '/dev/sdb1';

export interface MockMultiUsbDrive {
  multiUsbDrive: Mocked<MultiUsbDrive>;
  assertComplete(): void;
  /**
   * Simulates inserting a USB drive with the given file contents. Configures
   * getDrives to return a mounted partition backed by a temp directory.
   * Defaults to FAT32; pass `{ fstype: 'ext4' }` for ext4.
   */
  insertUsbDrive(
    contents: MockFileTree,
    options?: { fstype?: UsbDriveFilesystemType }
  ): void;
  /**
   * Simulates removing the USB drive. Configures getDrives to return an empty
   * list.
   */
  removeUsbDrive(): void;
}

/**
 * Creates a mock of the MultiUsbDrive interface. Each method is mocked with a
 * mockFunction (see @votingworks/test-utils).
 *
 * Also has insert()/remove() methods to create a mock USB drive backed by a
 * filesystem directory. If using this interface, getDrives will automatically
 * return the correct state.
 *
 * Requires that `setupTemporaryRootDir()` from `@votingworks/fixtures` has been
 * called.
 */
export function createMockMultiUsbDrive(): MockMultiUsbDrive {
  let mockUsbTmpDir: string | undefined;

  const multiUsbDrive: Mocked<MultiUsbDrive> = {
    getDrives: mockFunction('getDrives'),
    refresh: mockFunction('refresh'),
    ejectDrive: mockFunction('ejectDrive'),
    formatDrive: mockFunction('formatDrive'),
    sync: mockFunction('sync'),
    stop: mockFunction('stop'),
  };

  // Initialize with no drive connected
  multiUsbDrive.getDrives.expectRepeatedCallsWith().returns([]);

  return {
    multiUsbDrive,

    assertComplete() {
      for (const method of Object.values(multiUsbDrive)) {
        method.assertComplete();
      }
    },

    insertUsbDrive(
      contents: MockFileTree,
      options?: { fstype?: UsbDriveFilesystemType }
    ) {
      const fstype = options?.fstype ?? 'fat32';
      mockUsbTmpDir = makeTemporaryDirectory();
      writeMockFileTree(mockUsbTmpDir, contents);
      const drives: UsbDriveInfo[] = [
        {
          devPath: MOCK_DISK_DEV_PATH,
          vendor: undefined,
          model: undefined,
          serial: undefined,
          partitions: [
            {
              devPath: MOCK_PARTITION_DEV_PATH,
              label: 'VxUSB-ABCDE',
              fstype: fstype === 'ext4' ? 'ext4' : 'vfat',
              fsver: fstype === 'ext4' ? '1.0' : 'FAT32',
              mount: { type: 'mounted', mountPoint: mockUsbTmpDir },
            },
          ],
        },
      ];
      multiUsbDrive.getDrives.reset();
      multiUsbDrive.getDrives.expectRepeatedCallsWith().returns(drives);
    },

    removeUsbDrive() {
      mockUsbTmpDir = undefined;
      multiUsbDrive.getDrives.reset();
      multiUsbDrive.getDrives.expectRepeatedCallsWith().returns([]);
    },
  };
}
