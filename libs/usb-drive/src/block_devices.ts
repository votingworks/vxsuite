import makeDebug from 'debug';
import { promises as fs } from 'node:fs';
import { basename } from 'node:path';
import { exec } from './exec';

const debug = makeDebug('usb-drive');

export interface BlockDeviceInfo {
  name: string;
  path: string;
  mountpoint: string | null;
  fstype: string | null;
  fsver: string | null;
  label: string | null;
  type: string;
}

// All block device info comes from two sources that don't require privileged
// access:
//
// - udevadm info --export-db: reads udev's database files in /run/udev/data/
//   directly. We identify USB devices via ID_BUS=usb and get device name
//   (DEVNAME), type (DEVTYPE), and filesystem attributes (ID_FS_TYPE,
//   ID_FS_VERSION, ID_FS_LABEL). We use udevadm instead of lsblk because
//   lsblk probes block devices directly, which can cause permissions issues
//   in some environments.
//
// - /proc/mounts: a standard procfs file (world-readable) containing the
//   kernel's current mount table, used to determine mount state.

function parseMountpoints(mountsContent: string): Map<string, string> {
  return new Map(
    mountsContent.split('\n').flatMap((line) => {
      const [device, mountpoint] = line.split(' ');
      return device && mountpoint ? [[device, mountpoint] as const] : [];
    })
  );
}

interface UsbBlockDevice {
  devname: string;
  devtype: 'disk' | 'partition';
  fstype: string | null;
  fsver: string | null;
  label: string | null;
}

function get(block: string, key: string): string | null {
  const match = block.match(new RegExp(`^E: ${key}=(.+)$`, 'm'));
  return match?.[1] ?? null;
}

function parseExportDb(output: string): UsbBlockDevice[] {
  const devices: UsbBlockDevice[] = [];

  for (const block of output.split('\n\n')) {
    if (get(block, 'ID_BUS') !== 'usb') continue;
    if (get(block, 'SUBSYSTEM') !== 'block') continue;

    const devtype = get(block, 'DEVTYPE');
    if (devtype !== 'disk' && devtype !== 'partition') continue;

    const devname = get(block, 'DEVNAME');
    if (!devname) continue;

    debug(`Found USB block device in udev database: ${devname} (${devtype})`);
    devices.push({
      devname,
      devtype,
      fstype: get(block, 'ID_FS_TYPE'),
      fsver: get(block, 'ID_FS_VERSION'),
      label: get(block, 'ID_FS_LABEL'),
    });
  }

  return devices;
}

const DEFAULT_MEDIA_MOUNT_DIR = '/media';

function isDataUsbDrive(blockDeviceInfo: BlockDeviceInfo): boolean {
  return (
    (blockDeviceInfo.type === 'part' || blockDeviceInfo.type === 'disk') &&
    !blockDeviceInfo.fstype?.includes('LVM') && // no partitions acting as LVMs
    (!blockDeviceInfo.mountpoint ||
      blockDeviceInfo.mountpoint.startsWith(DEFAULT_MEDIA_MOUNT_DIR))
  );
}

/**
 * Returns the device info for the USB drive, if it's a removable data drive.
 * Returns info for both partitioned drives (type 'part') and unpartitioned
 * drives (type 'disk'). Callers should use the type to determine whether the
 * drive needs to be formatted before use.
 *
 * NOTE: Only a single USB drive is supported. When multiple USB drives are
 * present, the first one enumerated is returned.
 */
export async function getUsbDriveDeviceInfo(): Promise<
  BlockDeviceInfo | undefined
> {
  const [exportDbOutput, mountsContent] = await Promise.all([
    exec('udevadm', ['info', '--export-db'])
      .then(({ stdout }) => stdout)
      .catch(() => ''),
    fs.readFile('/proc/mounts', 'utf-8').catch(() => ''),
  ]);

  const usbBlockDevices = parseExportDb(exportDbOutput);
  if (usbBlockDevices.length === 0) {
    debug('No USB block devices found in udev database');
    return undefined;
  }

  // Prefer partitions over their parent disks: skip disk entries that have
  // at least one partition in the udev database.
  const candidates = usbBlockDevices.filter(
    (d) =>
      d.devtype === 'partition' ||
      !usbBlockDevices.some(
        (p) => p.devtype === 'partition' && p.devname.startsWith(d.devname)
      )
  );

  const mountpoints = parseMountpoints(mountsContent);

  const deviceInfos: BlockDeviceInfo[] = candidates.map((d) => ({
    name: basename(d.devname),
    path: d.devname,
    type: d.devtype === 'partition' ? 'part' : 'disk',
    mountpoint: mountpoints.get(d.devname) ?? null,
    fstype: d.fstype,
    fsver: d.fsver,
    label: d.label,
  }));

  const dataUsbDrive = deviceInfos.find(isDataUsbDrive);
  if (!dataUsbDrive) {
    debug('USB block device(s) found, but none are usable data drives');
    return undefined;
  }

  debug(`Detected USB drive at ${dataUsbDrive.path}`);
  return dataUsbDrive;
}
