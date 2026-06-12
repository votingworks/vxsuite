import makeDebug from 'debug';
import { assert, throwIllegalValue } from '@votingworks/basics';
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

      switch (mount.type) {
        case 'mounting':
          debug('adapter: partition is mounting, returning no_drive');
          return Promise.resolve({ status: 'no_drive' });
        case 'mounted':
          debug(`adapter: partition is mounted at ${mount.mountPoint}`);
          return Promise.resolve({
            status: 'mounted',
            mountPoint: mount.mountPoint,
          });
        case 'unmounting':
          debug('adapter: partition is unmounting, returning mounted');
          return Promise.resolve({
            status: 'mounted',
            mountPoint: mount.mountPoint,
          });
        case 'formatting':
          // Formatting unmounts the drive first; present it as ejected, which
          // is what legacy single-drive consumers expect mid-format.
          debug('adapter: partition is formatting, returning ejected');
          return Promise.resolve({ status: 'ejected' });
        case 'ejected':
          debug('adapter: partition is ejected, returning ejected');
          return Promise.resolve({ status: 'ejected' });
        case 'unmounted':
          debug('adapter: partition is unmounted, returning no_drive');
          return Promise.resolve({ status: 'no_drive' });
        default:
          /* istanbul ignore next */
          return throwIllegalValue(mount);
      }
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
      // Only sync a fully-mounted partition — skip while an eject is
      // unmounting it, since syncing would race the unmount.
      const mountedPartition =
        drive?.partition?.mount.type === 'mounted'
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
