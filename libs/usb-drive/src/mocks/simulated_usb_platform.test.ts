import { assertDefined } from '@votingworks/basics';
import { makeTemporaryDirectory } from '@votingworks/fixtures';
import { backendWaitFor } from '@votingworks/test-utils';
import { Buffer } from 'node:buffer';
import { existsSync } from 'node:fs';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test, vi } from 'vitest';
import {
  UsbDiskDevPathSchema,
  UsbPartitionDevPathSchema,
  UsbPartitionMountpoint,
  UsbPartitionMountpointSchema,
} from '../types';
import { UsbPlatformDrive, UsbPlatformPartition } from '../usb_platform';
import { SimulatedUsbPlatform } from './simulated_usb_platform';

function getSimulatedMountpoint(
  platform: SimulatedUsbPlatform
): UsbPartitionMountpoint {
  return assertDefined(platform.getSimulatedDrives()[0]?.partition?.mountpoint);
}

async function readTestFile(platform: SimulatedUsbPlatform): Promise<string> {
  return await readFile(
    join(getSimulatedMountpoint(platform), 'README'),
    'utf-8'
  );
}

async function writeTestFile(
  platform: SimulatedUsbPlatform,
  data: string
): Promise<void> {
  await writeFile(join(getSimulatedMountpoint(platform), 'README'), data);
}

const devsdb = UsbDiskDevPathSchema.decode('/dev/sdb');
const devsdb1 = UsbPartitionDevPathSchema.decode('/dev/sdb1');
const devsdc = UsbDiskDevPathSchema.decode('/dev/sdc');
const devsdc1 = UsbPartitionDevPathSchema.decode('/dev/sdc1');

test('starts empty', async () => {
  const platform = new SimulatedUsbPlatform(makeTemporaryDirectory());
  await expect(platform.getDrives()).resolves.toEqual([]);
  expect(platform.getSimulatedDrives()).toEqual([]);
});

test('tolerates a deleted devices.json', async () => {
  const platform = new SimulatedUsbPlatform(makeTemporaryDirectory());
  await rm(platform['stateFilePath']);
  await expect(platform.getDrives()).resolves.toEqual([]);
});

test('crashes on a corrupted devices.json', async () => {
  const platform = new SimulatedUsbPlatform(makeTemporaryDirectory());
  await writeFile(platform['stateFilePath'], 'not json');
  await expect(platform.getDrives()).rejects.toThrow();
});

test('bad diskPath crashes', async () => {
  const platform = new SimulatedUsbPlatform(makeTemporaryDirectory());

  expect(() => platform.removeDrive(devsdb)).toThrow();
  expect(() => platform.deleteDrive(devsdb)).toThrow();
  expect(() => platform.clearDriveStorage(devsdb)).toThrow();
  expect(() => platform.insertDrive(devsdb)).toThrow();
  await expect(
    platform.formatDrive(devsdb, 'fat32', 'LABEL')
  ).rejects.toThrow();
  await expect(platform.mountPartition(devsdb1)).rejects.toThrow();
  await expect(
    platform.unmountPartition(platform.storagePath(devsdb))
  ).rejects.toThrow();

  platform.createDrive({ diskPath: devsdb, fstype: 'fat32' });
  platform.insertDrive(devsdb);
  await expect(platform.mountPartition(devsdc1)).rejects.toThrow();
  await platform.mountPartition(devsdb1);
  await expect(
    platform.unmountPartition(platform.storagePath(devsdc))
  ).rejects.toThrow();
});

test('cannot create a drive that already exists', () => {
  const platform = new SimulatedUsbPlatform(makeTemporaryDirectory());
  platform.createDrive({ diskPath: devsdb, fstype: 'fat32' });
  expect(() =>
    platform.createDrive({ diskPath: devsdb, fstype: 'fat32' })
  ).toThrow();
});

test('cannot create an unformatted drive with contents', () => {
  const platform = new SimulatedUsbPlatform(makeTemporaryDirectory());
  expect(() =>
    platform.createDrive({
      diskPath: devsdb,
      contents: { README: Buffer.from('orphaned') },
    })
  ).toThrow('Cannot create an unformatted drive with contents');
});

test('unformatted drive lifecycle: create, insert, format', async () => {
  const platform = new SimulatedUsbPlatform(makeTemporaryDirectory());
  platform.createDrive({ diskPath: devsdb });
  platform.insertDrive(devsdb);

  // Visible to the platform, but with no usable partition — mirroring how
  // RealUsbPlatform reports unformatted drives.
  await expect(platform.getDrives()).resolves.toEqual([{ diskPath: devsdb }]);

  // Without a partition there is nothing to mount or unmount.
  await expect(platform.mountPartition(devsdb1)).rejects.toThrow();
  await expect(
    platform.unmountPartition(platform.storagePath(devsdb))
  ).rejects.toThrow();

  // Unplugging and re-attaching keeps it unformatted.
  platform.removeDrive(devsdb);
  platform.insertDrive(devsdb);

  // Formatting installs a mounted partition.
  await platform.formatDrive(devsdb, 'fat32', 'VxUSB-ABCDE');
  await expect(platform.getDrives()).resolves.toEqual([
    {
      diskPath: devsdb,
      partition: {
        partPath: devsdb1,
        fstype: 'fat32',
        label: 'VxUSB-ABCDE',
        mountpoint: platform.storagePath(devsdb),
      },
    },
  ]);
});

test('deleting a present unformatted drive works without an unmount', async () => {
  const platform = new SimulatedUsbPlatform(makeTemporaryDirectory());
  platform.createDrive({ diskPath: devsdb });
  platform.insertDrive(devsdb);
  platform.deleteAllDrives();
  expect(platform.getSimulatedDrives()).toEqual([]);
  await expect(platform.getDrives()).resolves.toEqual([]);
});

test('created drives are not present until inserted', async () => {
  const platform = new SimulatedUsbPlatform(makeTemporaryDirectory());

  platform.createDrive({
    diskPath: devsdb,
    fstype: 'fat32',
  });
  // Created but not attached: invisible to the platform, but tracked.
  await expect(platform.getDrives()).resolves.toEqual([]);
  expect(platform.getSimulatedDrives()).toEqual([
    expect.objectContaining({
      diskPath: devsdb,
      present: false,
    }),
  ]);

  platform.insertDrive(devsdb);
  await expect(platform.getDrives()).resolves.toEqual([
    expect.objectContaining<Partial<UsbPlatformDrive>>({
      diskPath: devsdb,
    }),
  ]);
  expect(platform.getSimulatedDrives()).toEqual([
    expect.objectContaining({
      diskPath: devsdb,
      present: true,
    }),
  ]);
  // The platform's view of attached hardware doesn't leak the presence flag.
  const [drive] = await platform.getDrives();
  expect(drive).not.toHaveProperty('present');
});

test('failed create cleans up storage path', () => {
  const platform = new SimulatedUsbPlatform(makeTemporaryDirectory());
  vi.spyOn(
    platform as unknown as { writeStateFile: () => void },
    'writeStateFile'
  ).mockThrow('FAIL');
  expect(() =>
    platform.createDrive({ diskPath: devsdb, fstype: 'fat32' })
  ).toThrow();
  expect(existsSync(platform.storagePath(devsdb))).toEqual(false);
});

test('watch changes', async () => {
  const platform = new SimulatedUsbPlatform(makeTemporaryDirectory());
  const onDeviceChange1 = vi.fn();
  const onDeviceChange2 = vi.fn();
  const watcher1 = platform.watchChanges(onDeviceChange1);
  const watcher2 = platform.watchChanges(onDeviceChange2);

  platform.createDrive({ diskPath: devsdb, fstype: 'fat32' });
  platform.insertDrive(devsdb);
  await backendWaitFor(() => {
    expect(onDeviceChange1.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(onDeviceChange2.mock.calls.length).toBeGreaterThanOrEqual(1);
  });

  watcher2.stop();
  const callsBeforeStop = onDeviceChange2.mock.calls.length;
  platform.createDrive({ diskPath: devsdc, fstype: 'fat32' });
  platform.insertDrive(devsdc);
  await backendWaitFor(() => {
    expect(onDeviceChange1.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
  expect(onDeviceChange2.mock.calls.length).toEqual(callsBeforeStop);

  platform.deleteAllDrives();
  await backendWaitFor(() => {
    expect(onDeviceChange1.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  watcher1.stop();
});

test('full lifecycle', async () => {
  const platform = new SimulatedUsbPlatform(makeTemporaryDirectory());
  const onDeviceChange = vi.fn();
  const watcher = platform.watchChanges(onDeviceChange);
  expect(onDeviceChange).toHaveBeenCalledTimes(0);

  platform.createDrive({
    diskPath: devsdb,
    fstype: 'fat32',
  });
  platform.insertDrive(devsdb);
  await backendWaitFor(() => {
    expect(onDeviceChange.mock.calls.length).toBeGreaterThanOrEqual(1);
  });
  await expect(platform.getDrives()).resolves.toEqual([
    expect.objectContaining<Partial<UsbPlatformDrive>>({
      diskPath: devsdb,
      partition: expect.objectContaining<Partial<UsbPlatformPartition>>({
        fstype: 'fat32',
      }),
    }),
  ]);

  await platform.mountPartition(devsdb1);
  const drives = await platform.getDrives();
  expect(drives).toEqual([
    expect.objectContaining<Partial<UsbPlatformDrive>>({
      diskPath: devsdb,
      partition: expect.objectContaining<Partial<UsbPlatformPartition>>({
        fstype: 'fat32',
        mountpoint: expect.any(String),
      }),
    }),
  ]);

  await writeTestFile(platform, 'hello world');

  await platform.unmountPartition(platform.storagePath(devsdb));
  await expect(platform.getDrives()).resolves.toEqual([
    expect.objectContaining<Partial<UsbPlatformDrive>>({
      diskPath: devsdb,
      partition: expect.objectContaining<Partial<UsbPlatformPartition>>({
        fstype: 'fat32',
        mountpoint: undefined,
      }),
    }),
  ]);

  await platform.mountPartition(devsdb1);
  const afterRemountDrives = await platform.getDrives();
  expect(afterRemountDrives).toEqual([
    expect.objectContaining<Partial<UsbPlatformDrive>>({
      diskPath: UsbDiskDevPathSchema.decode('/dev/sdb'),
      partition: expect.objectContaining<Partial<UsbPlatformPartition>>({
        fstype: 'fat32',
        mountpoint: expect.any(String),
      }),
    }),
  ]);
  await expect(readTestFile(platform)).resolves.toEqual('hello world');

  // Removing a drive detaches it but preserves its storage.
  platform.removeDrive(devsdb);
  await expect(platform.getDrives()).resolves.toEqual([]);
  expect(platform.getSimulatedDrives()).toEqual([
    expect.objectContaining({
      diskPath: UsbDiskDevPathSchema.decode('/dev/sdb'),
      present: false,
    }),
  ]);

  // Reattaching and remounting preserves the previously written contents.
  platform.insertDrive(devsdb);
  await platform.mountPartition(devsdb1);
  await expect(readTestFile(platform)).resolves.toEqual('hello world');

  // Clearing wipes contents but keeps the drive present.
  platform.clearDriveStorage(devsdb);
  expect(platform.getSimulatedDrives()).toEqual([
    expect.objectContaining({
      diskPath: UsbDiskDevPathSchema.decode('/dev/sdb'),
      present: true,
    }),
  ]);
  await expect(readTestFile(platform)).rejects.toThrow();

  // Formatting re-partitions the drive and clears contents.
  await writeTestFile(platform, 'should be cleared by formatDrive');
  await platform.formatDrive(devsdb, 'ext4', 'GOODIES');
  await platform.mountPartition(devsdb1);
  const afterFormatDrives = await platform.getDrives();
  expect(afterFormatDrives).toEqual([
    expect.objectContaining<Partial<UsbPlatformDrive>>({
      diskPath: UsbDiskDevPathSchema.decode('/dev/sdb'),
      partition: expect.objectContaining<Partial<UsbPlatformPartition>>({
        fstype: 'ext4',
        label: 'GOODIES',
        mountpoint: expect.any(String),
      }),
    }),
  ]);
  await expect(readTestFile(platform)).rejects.toThrow();

  // Deleting a drive removes it and its storage entirely.
  platform.deleteDrive(devsdb);
  await expect(platform.getDrives()).resolves.toEqual([]);
  expect(platform.getSimulatedDrives()).toEqual([]);

  watcher.stop();
  onDeviceChange.mockClear();

  platform.createDrive({ diskPath: devsdb, fstype: 'fat32' });
  platform.insertDrive(devsdb);
  await platform.mountPartition(devsdb1);

  // Simulated platform `sync` doesn't really do anything.
  await platform.sync(platform.storagePath(devsdb));
  await expect(
    platform.sync(UsbPartitionMountpointSchema.decode('/mnt/nonexistent'))
  ).rejects.toThrow();

  await platform.unmountPartition(platform.storagePath(devsdb));
  platform.deleteAllDrives();

  // No more calls after `watcher.stop()`.
  expect(onDeviceChange).toHaveBeenCalledTimes(0);
});

test('createDrive can seed initial contents', async () => {
  const platform = new SimulatedUsbPlatform(makeTemporaryDirectory());
  platform.createDrive({
    diskPath: devsdb,
    fstype: 'fat32',
    contents: { README: Buffer.from('seeded') },
  });
  platform.insertDrive(devsdb);
  await platform.mountPartition(devsdb1);
  await expect(readTestFile(platform)).resolves.toEqual('seeded');
});

test('deleteAllDrives is a no-op when there are no drives', () => {
  const platform = new SimulatedUsbPlatform(makeTemporaryDirectory());
  expect(() => platform.deleteAllDrives()).not.toThrow();
  expect(platform.getSimulatedDrives()).toEqual([]);
});

test('can delete a created drive that was never inserted', async () => {
  const platform = new SimulatedUsbPlatform(makeTemporaryDirectory());
  platform.createDrive({ diskPath: devsdb, fstype: 'fat32' });
  platform.deleteDrive(devsdb);
  expect(platform.getSimulatedDrives()).toEqual([]);
  await expect(platform.getDrives()).resolves.toEqual([]);
});

test('created-but-not-attached drives cannot be operated on as hardware', async () => {
  const platform = new SimulatedUsbPlatform(makeTemporaryDirectory());
  platform.createDrive({ diskPath: devsdb, fstype: 'fat32' });

  // The drive exists but is not plugged in, so hardware operations fail.
  expect(() => platform.removeDrive(devsdb)).toThrow('Drive not attached');
  await expect(platform.mountPartition(devsdb1)).rejects.toThrow();
  await expect(
    platform.unmountPartition(platform.storagePath(devsdb))
  ).rejects.toThrow();

  // Once attached, the same operations succeed.
  platform.insertDrive(devsdb);
  await expect(platform.mountPartition(devsdb1)).resolves.toBeUndefined();
});

test('tracks multiple drives independently', async () => {
  const platform = new SimulatedUsbPlatform(makeTemporaryDirectory());
  platform.createDrive({
    diskPath: devsdb,
    fstype: 'fat32',
    label: 'FIRST',
    contents: { README: Buffer.from('sdb-data') },
  });
  platform.createDrive({
    diskPath: devsdc,
    fstype: 'ext4',
    label: 'SECOND',
    contents: { README: Buffer.from('sdc-data') },
  });

  // With only sdb attached, the platform's view shows just sdb.
  platform.insertDrive(devsdb);
  await expect(platform.getDrives()).resolves.toEqual([
    expect.objectContaining<Partial<UsbPlatformDrive>>({ diskPath: devsdb }),
  ]);

  platform.insertDrive(devsdc);
  await platform.mountPartition(devsdb1);
  await platform.mountPartition(devsdc1);

  // Each drive keeps its own partition path, fstype, and label.
  const drives = await platform.getDrives();
  expect(drives).toEqual([
    expect.objectContaining<Partial<UsbPlatformDrive>>({
      diskPath: devsdb,
      partition: expect.objectContaining<Partial<UsbPlatformPartition>>({
        partPath: devsdb1,
        fstype: 'fat32',
        label: 'FIRST',
      }),
    }),
    expect.objectContaining<Partial<UsbPlatformDrive>>({
      diskPath: devsdc,
      partition: expect.objectContaining<Partial<UsbPlatformPartition>>({
        partPath: devsdc1,
        fstype: 'ext4',
        label: 'SECOND',
      }),
    }),
  ]);

  // Each drive has its own isolated storage at a distinct mountpoint.
  const [sdb, sdc] = drives;
  const sdbMountpoint = assertDefined(sdb?.partition?.mountpoint);
  const sdcMountpoint = assertDefined(sdc?.partition?.mountpoint);
  expect(sdbMountpoint).not.toEqual(sdcMountpoint);
  await expect(
    readFile(join(sdbMountpoint, 'README'), 'utf-8')
  ).resolves.toEqual('sdb-data');
  await expect(
    readFile(join(sdcMountpoint, 'README'), 'utf-8')
  ).resolves.toEqual('sdc-data');
});

test('deleteDrive removes only the target drive, leaving others intact', async () => {
  const platform = new SimulatedUsbPlatform(makeTemporaryDirectory());
  platform.createDrive({ diskPath: devsdb, fstype: 'fat32' });
  platform.createDrive({ diskPath: devsdc, fstype: 'ext4' });
  platform.insertDrive(devsdb);
  platform.insertDrive(devsdc);
  await platform.mountPartition(devsdc1);

  platform.deleteDrive(devsdb);

  // sdc survives with its state (present, mounted, ext4) fully intact.
  expect(platform.getSimulatedDrives()).toEqual([
    expect.objectContaining({ diskPath: devsdc, present: true }),
  ]);
  await expect(platform.getDrives()).resolves.toEqual([
    expect.objectContaining<Partial<UsbPlatformDrive>>({
      diskPath: devsdc,
      partition: expect.objectContaining<Partial<UsbPlatformPartition>>({
        fstype: 'ext4',
        mountpoint: expect.any(String),
      }),
    }),
  ]);
});

test('shares on-disk state across instances on the same root', async () => {
  const root = makeTemporaryDirectory();
  const platformA = new SimulatedUsbPlatform(root);
  platformA.createDrive({ diskPath: devsdb, fstype: 'fat32' });
  platformA.insertDrive(devsdb);

  // A second instance on the same root sees state created by the first.
  const platformB = new SimulatedUsbPlatform(root);
  await expect(platformB.getDrives()).resolves.toEqual([
    expect.objectContaining<Partial<UsbPlatformDrive>>({ diskPath: devsdb }),
  ]);

  // And mutations made through B are visible to A.
  platformB.removeDrive(devsdb);
  await expect(platformA.getDrives()).resolves.toEqual([]);
});
