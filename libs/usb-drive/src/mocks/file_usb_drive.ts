import { Optional } from '@votingworks/basics';
import {
  BooleanEnvironmentVariableName,
  isFeatureFlagEnabled,
} from '@votingworks/utils';
import { MockFileTree, writeMockFileTree } from './helpers';
import { getMockUsbDirPath } from './mock_usb_dir';
import {
  SimulatedUsbDrive,
  SimulatedUsbPlatform,
} from './simulated_usb_platform';
import { UsbDiskDevPath, UsbDiskDevPathSchema, UsbDriveStatus } from '../types';

export {
  DEV_MOCK_USB_DRIVE_GLOB_PATTERN,
  getMockUsbDirPath,
  resetMockUsbDriveDir,
  setMockUsbDriveDir,
} from './mock_usb_dir';

/**
 * Returns the {@link SimulatedUsbPlatform} backing mock USB drives in dev and
 * test, over the shared on-disk state directory. Use this to manipulate
 * simulated drives (e.g. from the dev dock or test helpers); use
 * {@link getSimulatedUsbPlatform} to decide whether an app should run against
 * simulated or real hardware.
 */
export function getMockUsbPlatform(): SimulatedUsbPlatform {
  return new SimulatedUsbPlatform(getMockUsbDirPath());
}

/**
 * Returns the simulated USB platform when the `USE_MOCK_USB_DRIVE` feature
 * flag is enabled, or `undefined` to use real hardware. Pass the result to
 * `detectUsbDrive`/`detectMultiUsbDrive`:
 *
 * ```ts
 * const usbDrive = detectUsbDrive(logger, {
 *   platform: getSimulatedUsbPlatform(),
 * });
 * ```
 */
export function getSimulatedUsbPlatform(): Optional<SimulatedUsbPlatform> {
  if (
    !isFeatureFlagEnabled(BooleanEnvironmentVariableName.USE_MOCK_USB_DRIVE)
  ) {
    return undefined;
  }
  return getMockUsbPlatform();
}

export interface MockFileUsbDriveHandler {
  status: () => UsbDriveStatus;
  insert: (contents?: MockFileTree) => void;
  remove: () => void;
  clearData: () => void;
  getDataPath: () => Optional<string>;
  cleanup: () => void;
}

/**
 * A convenience handler for manipulating a single simulated USB drive from
 * dev tooling and integration tests. Backed by {@link SimulatedUsbPlatform},
 * so apps running with `USE_MOCK_USB_DRIVE` observe the same drives.
 *
 * Note that, unlike the historical file-based mock, an inserted drive is
 * mounted by the consuming app's drive detection (as with real hardware), not
 * by insertion itself.
 */
export function getMockFileUsbDriveHandler(
  diskName = 'sdb'
): MockFileUsbDriveHandler {
  const platform = getMockUsbPlatform();
  const diskPath: UsbDiskDevPath = UsbDiskDevPathSchema.decode(
    `/dev/${diskName}`
  );

  function findDrive(): Optional<SimulatedUsbDrive> {
    return platform
      .getSimulatedDrives()
      .find((drive) => drive.diskPath === diskPath);
  }

  return {
    status: (): UsbDriveStatus => {
      const drive = findDrive();
      if (!drive?.present) {
        return { status: 'no_drive' };
      }
      const mountpoint = drive.partition?.mountpoint;
      return mountpoint
        ? { status: 'mounted', mountpoint }
        : { status: 'ejected' };
    },

    insert: (contents?: MockFileTree) => {
      if (!findDrive()) {
        platform.createDrive({ diskPath, fstype: 'fat32' });
      }
      if (contents) {
        writeMockFileTree(platform.storagePath(diskPath), contents);
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
