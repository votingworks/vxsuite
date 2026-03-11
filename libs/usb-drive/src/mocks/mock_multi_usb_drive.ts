import { MockFunction, mockFunction } from '@votingworks/test-utils';
import { makeTemporaryDirectory } from '@votingworks/fixtures';
import { MultiUsbDrive, UsbDriveInfo } from '../multi_usb_drive';
import { UsbDrive } from '../types';
import { createUsbDriveAdapter } from '../usb_drive_adapter';
import { MockFileTree, writeMockFileTree } from './helpers';

type MockedMultiUsbDrive = {
  [Method in keyof MultiUsbDrive]: MockFunction<MultiUsbDrive[Method]>;
};

const MOCK_DISK_DEV_PATH = '/dev/sdb';
const MOCK_PARTITION_DEV_PATH = '/dev/sdb1';

/**
 * A mock of the MultiUsbDrive interface. See createMockMultiUsbDrive for
 * details.
 */
export interface MockMultiUsbDrive {
  multiUsbDrive: MockedMultiUsbDrive;
  /**
   * A UsbDrive adapter backed by the multiUsbDrive mock. Useful for passing
   * directly to functions that accept a UsbDrive interface.
   */
  usbDrive: UsbDrive;
  assertComplete(): void;
  /**
   * Simulates inserting a USB drive with the given file contents. Configures
   * getDrives to return a mounted FAT32 partition backed by a temp directory.
   */
  insertUsbDrive(contents: MockFileTree): void;
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

  const multiUsbDrive: MockedMultiUsbDrive = {
    getDrives: mockFunction('getDrives'),
    refresh: mockFunction('refresh'),
    ejectDrive: mockFunction('ejectDrive'),
    formatDrive: mockFunction('formatDrive'),
    sync: mockFunction('sync'),
    stop: mockFunction('stop'),
  };

  // Initialize with no drive connected
  multiUsbDrive.getDrives.expectRepeatedCallsWith().returns([]);

  const usbDrive = createUsbDriveAdapter(
    multiUsbDrive,
    () => MOCK_DISK_DEV_PATH
  );

  return {
    multiUsbDrive,
    usbDrive,

    assertComplete() {
      for (const method of Object.values(multiUsbDrive)) {
        method.assertComplete();
      }
    },

    insertUsbDrive(contents: MockFileTree) {
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
              fstype: 'vfat',
              fsver: 'FAT32',
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
