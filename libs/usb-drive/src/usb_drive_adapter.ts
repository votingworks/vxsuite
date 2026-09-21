import { extractErrorMessage, throwIllegalValue } from '@votingworks/basics';
import { UsbDriveSpace } from '@votingworks/utils';
import makeDebug from 'debug';
import { MultiUsbDrive } from './multi_usb_drive.js';
import {
  mountedUsbDriveStatus,
  UsbDiskDevPath,
  UsbDrive,
  UsbDriveFormatFilesystemType,
  UsbDriveInfo,
  UsbDriveStatus,
  UsbPartitionInfo,
  UsbPartitionMountpoint,
} from './types.js';

const debug = makeDebug('usb-drive:adapter');

type SupportedUsbDriveInfo = UsbDriveInfo & { partition: UsbPartitionInfo };

function isSupported(drive: UsbDriveInfo): drive is SupportedUsbDriveInfo {
  return drive.partition !== undefined;
}

/**
 * The drive the adapter is acting on: the one `getDriveDevPath` chose among
 * the supported drives, or failing that a drive with no usable partition
 * (unformatted, or an unsupported file system), which can still be formatted.
 */
type SelectedDrive =
  | { type: 'supported'; drive: SupportedUsbDriveInfo }
  | { type: 'unsupported'; drive: UsbDriveInfo }
  | { type: 'none' };

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
  getDriveDevPath: (
    usbDrives: readonly UsbDriveInfo[]
  ) => UsbDiskDevPath | undefined
): UsbDrive {
  function selectDrive(): SelectedDrive {
    const drives = multiUsbDrive.getDrives();
    const supportedDrives = drives.filter(isSupported);
    const driveDevPath =
      supportedDrives.length > 0 ? getDriveDevPath(supportedDrives) : undefined;
    const supportedDrive = supportedDrives.find(
      (d) => d.diskPath === driveDevPath
    );
    if (supportedDrive) {
      return { type: 'supported', drive: supportedDrive };
    }

    const unsupportedDrive = drives.find((d) => !isSupported(d));
    if (unsupportedDrive) {
      return { type: 'unsupported', drive: unsupportedDrive };
    }

    return { type: 'none' };
  }

  function selectSupportedDrive(): SupportedUsbDriveInfo | undefined {
    const selected = selectDrive();
    return selected.type === 'supported' ? selected.drive : undefined;
  }

  async function getSpace(
    mountpoint: UsbPartitionMountpoint
  ): Promise<UsbDriveSpace | undefined> {
    try {
      return await multiUsbDrive.getPartitionSpace(mountpoint);
    } catch (error) {
      debug(
        `adapter: could not read space at ${mountpoint}: ${extractErrorMessage(error)}`
      );
      return undefined;
    }
  }

  return {
    async status(): Promise<UsbDriveStatus> {
      const selected = selectDrive();

      if (selected.type === 'none') {
        debug('adapter: no drive selected, returning no_drive');
        return { status: 'no_drive' };
      }

      if (selected.type === 'unsupported') {
        debug(
          `adapter: ${selected.drive.diskPath} has no usable partition, returning bad_format`
        );
        return { status: 'error', reason: 'bad_format' };
      }

      const { partition } = selected.drive;
      const { mount } = partition;

      switch (mount.type) {
        case 'mounting':
          debug('adapter: partition is mounting, returning no_drive');
          return { status: 'no_drive' };
        case 'mounted':
          debug(`adapter: partition is mounted at ${mount.mountpoint}`);
          return mountedUsbDriveStatus(
            mount.mountpoint,
            partition.fstype,
            await getSpace(mount.mountpoint)
          );
        case 'unmounting':
          debug('adapter: partition is unmounting, returning mounted');
          return mountedUsbDriveStatus(
            mount.mountpoint,
            partition.fstype,
            await getSpace(mount.mountpoint)
          );
        case 'formatting':
          // Formatting unmounts the drive first; present it as ejected, which
          // is what legacy single-drive consumers expect mid-format.
          debug('adapter: partition is formatting, returning ejected');
          return { status: 'ejected' };
        case 'ejected':
          debug('adapter: partition is ejected, returning ejected');
          return { status: 'ejected' };
        case 'unmounted':
          debug('adapter: partition is unmounted, returning no_drive');
          return { status: 'no_drive' };
        default:
          return throwIllegalValue(mount);
      }
    },

    async eject(): Promise<void> {
      const drive = selectSupportedDrive();
      if (!drive) {
        debug('adapter: no drive to eject');
        return;
      }

      await multiUsbDrive.ejectDrive(drive.diskPath);
    },

    async format(fstype: UsbDriveFormatFilesystemType): Promise<void> {
      const selected = selectDrive();
      if (selected.type === 'none') {
        debug('adapter: no drive to format');
        return;
      }

      await multiUsbDrive.formatDrive(selected.drive.diskPath, fstype);
    },

    async sync(): Promise<void> {
      const drive = selectSupportedDrive();
      // Only sync a fully-mounted partition — skip while an eject is
      // unmounting it, since syncing would race the unmount.
      const mountedPartition =
        drive?.partition.mount.type === 'mounted' ? drive.partition : undefined;

      if (!mountedPartition) {
        debug('adapter: no mounted partition to sync');
        return;
      }

      await multiUsbDrive.sync(mountedPartition.partPath);
    },
  };
}
