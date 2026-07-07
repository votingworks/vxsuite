import {
  UsbDiskDevPathSchema,
  UsbDriveStatus,
  UsbPartitionMountpoint,
} from '../types';
import { MockFileTree } from './helpers';
import { getMockUsbDirPath } from './mock_usb_dir';
import { SimulatedUsbPlatform } from './simulated_usb_platform';

const DEFAULT_DISK_NAME = 'sdb';

/**
 * Controls a mock USB drive backed by a {@link SimulatedUsbPlatform} rooted at
 * {@link getMockUsbDirPath}. This is the same directory the app reads from when
 * `USE_MOCK_USB_DRIVE` is enabled (see `getEnvUsbPlatform`), so a handler in a
 * test or dev-tool process and the app's platform communicate through the
 * shared on-disk state — inserting a drive here makes it appear to the app.
 */
export interface MockUsbDriveHandler {
  status: () => UsbDriveStatus;
  insert: (contents?: MockFileTree) => void;
  remove: () => void;
  clearData: () => void;
  /**
   * The on-disk storage path for the drive's data. Always defined and
   * independent of whether the drive is currently inserted or mounted.
   */
  getDataPath: () => UsbPartitionMountpoint;
  cleanup: () => void;
}

export function getMockUsbDriveHandler(
  diskName = DEFAULT_DISK_NAME
): MockUsbDriveHandler {
  const platform = new SimulatedUsbPlatform(getMockUsbDirPath());
  const diskPath = UsbDiskDevPathSchema.decode(`/dev/${diskName}`);

  function findDrive() {
    return platform.getSimulatedDrives().find((d) => d.diskPath === diskPath);
  }

  return {
    status: (): UsbDriveStatus => {
      const drive = findDrive();
      if (!drive?.present) return { status: 'no_drive' };
      if (drive.partition?.mountpoint) {
        return { status: 'mounted', mountpoint: drive.partition.mountpoint };
      }
      return { status: 'ejected' };
    },
    insert: (contents?: MockFileTree) => {
      const drive = findDrive();
      if (!drive) {
        platform.createDrive({ diskPath, fstype: 'fat32', contents });
      } else if (contents) {
        platform.replaceDriveData(diskPath, contents);
      }
      if (!findDrive()?.present) {
        platform.insertDrive(diskPath);
      }
    },
    remove: () => {
      if (findDrive()?.present) {
        platform.removeDrive(diskPath);
      }
    },
    clearData: () => {
      if (findDrive()) {
        platform.clearDriveStorage(diskPath);
      }
    },
    getDataPath: () => platform.storagePath(diskPath),
    cleanup: () => {
      if (findDrive()) {
        platform.deleteDrive(diskPath);
      }
    },
  };
}
