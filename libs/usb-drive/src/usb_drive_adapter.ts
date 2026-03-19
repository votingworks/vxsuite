import makeDebug from 'debug';
import { MultiUsbDrive, UsbDriveInfo } from './multi_usb_drive';
import { UsbDrive, UsbDriveStatus } from './types';

const debug = makeDebug('usb-drive:adapter');

/**
 * Adapts a `MultiUsbDrive` instance to the single-drive `UsbDrive` interface.
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
      const drives = multiUsbDrive.getDrives();
      const driveDevPath = getDriveDevPath(drives);
      if (!driveDevPath) {
        debug('adapter: no drive device path, returning no_drive');
        return Promise.resolve({ status: 'no_drive' });
      }

      const drive = drives.find((d) => d.devPath === driveDevPath);

      if (!drive) {
        debug('adapter: drive not found in cache, returning no_drive');
        return Promise.resolve({ status: 'no_drive' });
      }

      const [firstPartition] = drive.partitions;

      if (!firstPartition) {
        debug('adapter: drive has no partitions, returning bad_format');
        return Promise.resolve({ status: 'error', reason: 'bad_format' });
      }

      if (
        firstPartition.fstype !== 'vfat' ||
        firstPartition.fsver !== 'FAT32'
      ) {
        debug('adapter: first partition is not FAT32, returning bad_format');
        return Promise.resolve({ status: 'error', reason: 'bad_format' });
      }

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
      const driveDevPath = getDriveDevPath(multiUsbDrive.getDrives());
      if (!driveDevPath) {
        debug('adapter: no drive to eject');
        return;
      }

      await multiUsbDrive.ejectDrive(driveDevPath);
    },

    async format(): Promise<void> {
      const driveDevPath = getDriveDevPath(multiUsbDrive.getDrives());
      if (!driveDevPath) {
        debug('adapter: no drive to format');
        return;
      }

      await multiUsbDrive.formatDrive(driveDevPath);
    },

    async sync(): Promise<void> {
      const drives = multiUsbDrive.getDrives();
      const driveDevPath = getDriveDevPath(drives);
      if (!driveDevPath) {
        debug('adapter: no drive to sync');
        return;
      }

      const drive = drives.find((d) => d.devPath === driveDevPath);
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
