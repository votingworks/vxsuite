import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
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

  function isPartitionOfDisk(partitionDevname: string, diskDevname: string): boolean {
    if (!partitionDevname.startsWith(diskDevname)) {
      return false;
    }

    const suffix = partitionDevname.slice(diskDevname.length);

    // Common Linux partition naming patterns:
    // - /dev/sda1   (disk: /dev/sda, suffix: "1")
    // - /dev/sda10  (disk: /dev/sda, suffix: "10")
    // - /dev/nvme0n1p1 (disk: /dev/nvme0n1, suffix: "p1")
    // - /dev/mmcblk0p1 (disk: /dev/mmcblk0, suffix: "p1")
    if (suffix.length === 0) {
      return false;
    }

    return /^[0-9]+$/.test(suffix) || /^p[0-9]+$/.test(suffix);
  }

  // Prefer partitions over their parent disks: skip disk entries that have
  // at least one partition in the udev database.
  const candidates = usbBlockDevices.filter(
    (d) =>
      d.devtype === 'partition' ||
      !usbBlockDevices.some(
        (p) =>
          p.devtype === 'partition' && isPartitionOfDisk(p.devname, d.devname)
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

export interface UsbDriveMonitor {
  getDeviceInfo(): BlockDeviceInfo | undefined;
  refresh(): Promise<void>;
  stop(): void;
}

const MONITOR_DEBOUNCE_MS = 50;
const MONITOR_RESTART_DELAY_MS = 1_000;

export function createUsbDriveMonitor(onRefresh?: () => void): UsbDriveMonitor {
  let cachedDeviceInfo: BlockDeviceInfo | undefined;
  let isFirstRefresh = true;
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  let monitorProcess: ChildProcess | undefined;
  let stopped = false;

  async function doRefresh(): Promise<void> {
    const newDeviceInfo = await getUsbDriveDeviceInfo();
    const stateChanged =
      isFirstRefresh ||
      JSON.stringify(newDeviceInfo) !== JSON.stringify(cachedDeviceInfo);
    isFirstRefresh = false;
    cachedDeviceInfo = newDeviceInfo;
    if (stateChanged) {
      onRefresh?.();
    }
  }

  function scheduleRefresh(): void {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => void doRefresh(), MONITOR_DEBOUNCE_MS);
  }

  function startMonitor(): void {
    if (stopped) return;
    const proc = spawn('udevadm', ['monitor', '--udev', '--subsystem-match=block']);
    monitorProcess = proc;
    proc.stdout.on('data', scheduleRefresh);
    // Handle spawn errors (e.g. binary not found) so they don't go unhandled.
    // The 'exit'/'close' event will fire after 'error' and trigger a restart.
    proc.on('error', (err) => {
      debug(`udevadm monitor process error: ${err}`);
    });
    proc.on('exit', () => {
      monitorProcess = undefined;
      if (!stopped) {
        setTimeout(startMonitor, MONITOR_RESTART_DELAY_MS);
      }
    });
  }

  void doRefresh();
  startMonitor();

  return {
    getDeviceInfo: () => cachedDeviceInfo,

    async refresh(): Promise<void> {
      await doRefresh();
    },

    stop(): void {
      stopped = true;
      clearTimeout(debounceTimer);
      monitorProcess?.kill();
    },
  };
}
