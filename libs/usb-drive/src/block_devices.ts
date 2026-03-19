import type { ChildProcess } from 'node:child_process';
import makeDebug from 'debug';
import { promises as fs } from 'node:fs';
import { basename } from 'node:path';
import { Optional } from '@votingworks/basics';
import { exec, spawn } from './exec.js';

const debug = makeDebug('usb-drive');

export interface BlockDeviceInfo {
  name: string;
  path: string;
  mountpoint?: string;
  fstype?: string;
  fsver?: string;
  label?: string;
  type: 'disk' | 'part';
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
  fstype?: string;
  fsver?: string;
  label?: string;
  vendor?: string;
  model?: string;
  serial?: string;
}

function get(block: string, key: string): Optional<string> {
  const match = block.match(new RegExp(`^E: ${key}=(.+)$`, 'm'));
  return match?.[1];
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
      vendor: get(block, 'ID_VENDOR'),
      model: get(block, 'ID_MODEL'),
      serial: get(block, 'ID_SERIAL_SHORT'),
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

function isPartitionOfDisk(
  partitionDevname: string,
  diskDevname: string
): boolean {
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

export interface UsbPartitionDeviceInfo {
  devPath: string;
  mountpoint?: string;
  fstype?: string;
  fsver?: string;
  label?: string;
}

export interface UsbDiskDeviceInfo {
  devPath: string;
  vendor?: string;
  model?: string;
  serial?: string;
  partitions: UsbPartitionDeviceInfo[];
}

/**
 * Returns all USB block devices as a structured disk → partitions hierarchy.
 * Includes vendor/model/serial parsed from udev for each disk. Applies the
 * same `isDataUsbDrive` filter as `getUsbDriveDeviceInfo`.
 */
export async function getAllUsbDrives(): Promise<UsbDiskDeviceInfo[]> {
  const [exportDbOutput, mountsContent] = await Promise.all([
    exec('udevadm', ['info', '--export-db'])
      .then(({ stdout }) => stdout)
      .catch(() => ''),
    fs.readFile('/proc/mounts', 'utf-8').catch(() => ''),
  ]);

  const usbBlockDevices = parseExportDb(exportDbOutput);
  if (usbBlockDevices.length === 0) {
    debug('No USB block devices found in udev database');
    return [];
  }

  const mountpoints = parseMountpoints(mountsContent);

  const diskDevices = usbBlockDevices.filter((d) => d.devtype === 'disk');
  const partitionDevices = usbBlockDevices.filter(
    (d) => d.devtype === 'partition'
  );

  const result: UsbDiskDeviceInfo[] = [];

  for (const disk of diskDevices) {
    const diskInfo: BlockDeviceInfo = {
      name: basename(disk.devname),
      path: disk.devname,
      type: 'disk',
      mountpoint: mountpoints.get(disk.devname),
      fstype: disk.fstype,
      fsver: disk.fsver,
      label: disk.label,
    };

    const diskPartitions = partitionDevices.filter((p) =>
      isPartitionOfDisk(p.devname, disk.devname)
    );

    if (diskPartitions.length > 0) {
      // Drive has partitions — only include valid data partitions
      const validPartitions: UsbPartitionDeviceInfo[] = diskPartitions
        .map(
          (p): BlockDeviceInfo => ({
            name: basename(p.devname),
            path: p.devname,
            type: 'part',
            mountpoint: mountpoints.get(p.devname),
            fstype: p.fstype,
            fsver: p.fsver,
            label: p.label,
          })
        )
        .filter(isDataUsbDrive)
        .map((p) => ({
          devPath: p.path,
          mountpoint: p.mountpoint,
          fstype: p.fstype,
          fsver: p.fsver,
          label: p.label,
        }));

      // Skip entirely if no partitions qualify — e.g. a non-/media mount.
      // Returning an empty-partition disk would look like an unformatted drive.
      if (validPartitions.length === 0) continue;

      result.push({
        devPath: disk.devname,
        vendor: disk.vendor,
        model: disk.model,
        serial: disk.serial,
        partitions: validPartitions,
      });
    } else if (isDataUsbDrive(diskInfo)) {
      // Unformatted drive (no partitions) — include it with empty partitions
      result.push({
        devPath: disk.devname,
        vendor: disk.vendor,
        model: disk.model,
        serial: disk.serial,
        partitions: [],
      });
    }
  }

  // Handle partitions whose parent disk has no udev entry. This is unusual but
  // observed with some USB card readers where only the partition (not the parent
  // disk) appears in the udev database. For each such orphan partition, derive
  // the disk path by stripping the partition suffix and synthesize a disk entry.
  const diskDevPaths = new Set(diskDevices.map((d) => d.devname));
  for (const partition of partitionDevices) {
    const diskDevPath = partition.devname.replace(/(p\d+|\d+)$/, '');
    if (diskDevPaths.has(diskDevPath)) continue;

    const partitionInfo: BlockDeviceInfo = {
      name: basename(partition.devname),
      path: partition.devname,
      type: 'part',
      mountpoint: mountpoints.get(partition.devname),
      fstype: partition.fstype,
      fsver: partition.fsver,
      label: partition.label,
    };
    if (!isDataUsbDrive(partitionInfo)) continue;

    result.push({
      devPath: diskDevPath,
      vendor: undefined,
      model: undefined,
      serial: undefined,
      partitions: [
        {
          devPath: partition.devname,
          mountpoint: partitionInfo.mountpoint,
          fstype: partition.fstype,
          fsver: partition.fsver,
          label: partition.label,
        },
      ],
    });
  }

  debug(`Found ${result.length} USB drive(s)`);
  return result;
}

export interface BlockDeviceChangeWatcher {
  stop(): void;
}

const MONITOR_DEBOUNCE_MS = 50;
const MONITOR_RESTART_DELAY_MS = 1_000;

export function createBlockDeviceChangeWatcher(
  onDeviceChange: () => void
): BlockDeviceChangeWatcher {
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  let monitorProcess: ChildProcess | undefined;
  let stopped = false;

  function scheduleChange(): void {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(onDeviceChange, MONITOR_DEBOUNCE_MS);
  }

  function startMonitor(): void {
    if (stopped) return;
    const proc = spawn('udevadm', [
      'monitor',
      '--udev',
      '--subsystem-match=block',
    ]);
    monitorProcess = proc;
    proc.stdout.on('data', scheduleChange);
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

  startMonitor();

  return {
    stop(): void {
      stopped = true;
      clearTimeout(debounceTimer);
      monitorProcess?.kill();
    },
  };
}
