import makeDebug from 'debug';
import { assert } from '@votingworks/basics';
import {
  isFat32Partition,
  MultiUsbDrive,
  UsbDriveInfo,
} from './multi_usb_drive';
import { UsbDrive, UsbDriveStatus } from './types';

const debug = makeDebug('usb-drive:adapter');

function getFat32Drives(drives: readonly UsbDriveInfo[]): UsbDriveInfo[] {
  return drives.filter((drive) => {
    const [firstPartition] = drive.partitions;
    return !!firstPartition && isFat32Partition(firstPartition);
  });
}

/**
 * Adapts a `MultiUsbDrive` instance to the single-drive `UsbDrive` interface.
 *
 * Only FAT32 drives are visible to the adapter. The drive list is filtered
 * before being passed to `getDriveDevPath`, so callers do not need to account
 * for non-FAT32 drives in their selection logic.
 *
 * `getDriveDevPath` selects which drive to expose. The adapter maps the first
 * partition's mount state to `UsbDriveStatus` for backward-compatible consumers
 * such as `Exporter`, `listDirectoryOnUsbDrive`, and `createSystemCallApi`.
 */
export function createUsbDriveAdapter(
  multiUsbDrive: MultiUsbDrive,
  getDriveDevPath: (usbDrives: readonly UsbDriveInfo[]) => string | undefined
): UsbDrive {
  return {
    status(): Promise<UsbDriveStatus> {
      const fat32Drives = getFat32Drives(multiUsbDrive.getDrives());
      const driveDevPath = getDriveDevPath(fat32Drives);
      if (!driveDevPath) {
        debug('adapter: no drive device path, returning no_drive');
        return Promise.resolve({ status: 'no_drive' });
      }

      const drive = fat32Drives.find((d) => d.devPath === driveDevPath);

      if (!drive) {
        debug('adapter: drive not found in cache, returning no_drive');
        return Promise.resolve({ status: 'no_drive' });
      }

      const [firstPartition] = drive.partitions;
      assert(firstPartition && isFat32Partition(firstPartition));

      const { mount } = firstPartition;

      if (mount.type === 'mounting') {
        debug('adapter: partition is mounting, returning no_drive');
        return Promise.resolve({ status: 'no_drive' });
      }

      if (mount.type === 'mounted') {
        debug(`adapter: partition is mounted at ${mount.mountPoint}`);
        return Promise.resolve({
          status: 'mounted',
          mountPoint: mount.mountPoint,
        });
      }

      if (mount.type === 'unmounting') {
        debug('adapter: partition is unmounting, returning mounted');
        return Promise.resolve({
          status: 'mounted',
          mountPoint: mount.mountPoint,
        });
      }

      // mount.type === 'ejected' or 'unmounted'
      if (mount.type === 'ejected') {
        debug('adapter: partition is ejected, returning ejected');
        return Promise.resolve({ status: 'ejected' });
      }

      debug('adapter: partition is unmounted, returning no_drive');
      return Promise.resolve({ status: 'no_drive' });
    },

    async eject(): Promise<void> {
      const driveDevPath = getDriveDevPath(
        getFat32Drives(multiUsbDrive.getDrives())
      );
      if (!driveDevPath) {
        debug('adapter: no drive to eject');
        return;
      }

      await multiUsbDrive.ejectDrive(driveDevPath);
    },

    async format(): Promise<void> {
      const driveDevPath = getDriveDevPath(
        getFat32Drives(multiUsbDrive.getDrives())
      );
      if (!driveDevPath) {
        debug('adapter: no drive to format');
        return;
      }

      await multiUsbDrive.formatDrive(driveDevPath, 'fat32');
    },

    async sync(): Promise<void> {
      const fat32Drives = getFat32Drives(multiUsbDrive.getDrives());
      const driveDevPath = getDriveDevPath(fat32Drives);
      if (!driveDevPath) {
        debug('adapter: no drive to sync');
        return;
      }

      const drive = fat32Drives.find((d) => d.devPath === driveDevPath);
      const mountedPartition = drive?.partitions.find(
        (p) => p.mount.type === 'mounted'
      );

      if (!mountedPartition) {
        debug('adapter: no mounted partition to sync');
        return;
      }

      await multiUsbDrive.sync(mountedPartition.devPath);
    },
  };
}
