import makeDebug from 'debug';
import { assert } from '@votingworks/basics';
import { MultiUsbDrive, UsbDriveFilesystemType } from './multi_usb_drive';
import { UsbDrive, UsbDriveInfo, UsbDriveStatus } from './types';

const debug = makeDebug('usb-drive:adapter');

/**
 * Adapts a `MultiUsbDrive` instance to the single-drive `UsbDrive` interface.
 *
 * `getDriveDevPath` selects which drive to expose from a list of drives with a
 * single partition. The adapter maps the partition's mount state to
 * `UsbDriveStatus` for backward-compatible consumers such as `Exporter` and
 * `createSystemCallApi`.
 */
export function createUsbDriveAdapter(
  multiUsbDrive: MultiUsbDrive,
  getDriveDevPath: (usbDrives: readonly UsbDriveInfo[]) => string | undefined
): UsbDrive {
  return {
    status(): Promise<UsbDriveStatus> {
      const drives = multiUsbDrive.getDrives().filter((d) => d.partition);

      if (drives.length === 0) {
        debug('adapter: no drives with a single partition, returning no_drive');
        return Promise.resolve({ status: 'no_drive' });
      }

      const driveDevPath = getDriveDevPath(drives);
      if (!driveDevPath) {
        debug('adapter: no drive device path, returning no_drive');
        return Promise.resolve({ status: 'no_drive' });
      }

      const drive = drives.find((d) => d.diskPath === driveDevPath);

      if (!drive) {
        debug('adapter: drive not found in cache, returning no_drive');
        return Promise.resolve({ status: 'no_drive' });
      }

      const { partition } = drive;
      assert(partition, `No partitions found on disk '${driveDevPath}'`);

      const { mount } = partition;

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
      const driveDevPath = getDriveDevPath(multiUsbDrive.getDrives());
      if (!driveDevPath) {
        debug('adapter: no drive to eject');
        return;
      }

      await multiUsbDrive.ejectDrive(driveDevPath);
    },

    async format(fstype: UsbDriveFilesystemType): Promise<void> {
      const driveDevPath = getDriveDevPath(multiUsbDrive.getDrives());
      if (!driveDevPath) {
        debug('adapter: no drive to format');
        return;
      }

      await multiUsbDrive.formatDrive(driveDevPath, fstype);
    },

    async sync(): Promise<void> {
      const drives = multiUsbDrive.getDrives();
      const driveDevPath = getDriveDevPath(drives);
      if (!driveDevPath) {
        debug('adapter: no drive to sync');
        return;
      }

      const drive = drives.find((d) => d.diskPath === driveDevPath);
      const mountedPartition = drive?.partition?.mount.isMounted
        ? drive.partition
        : undefined;

      if (!mountedPartition) {
        debug('adapter: no mounted partition to sync');
        return;
      }

      await multiUsbDrive.sync(mountedPartition.partPath);
    },
  };
}
