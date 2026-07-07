import { deferred } from '@votingworks/basics';
import { makeTemporaryDirectory } from '@votingworks/fixtures';
import { mockLogger } from '@votingworks/logging';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { SimulatedUsbPlatform } from './mocks/simulated_usb_platform';
import { detectMultiUsbDrive, MultiUsbDrive } from './multi_usb_drive';
import {
  UsbDiskDevPath,
  UsbDiskDevPathSchema,
  UsbDriveInfo,
  UsbPartitionMount,
} from './types';
import { createUsbDriveAdapter } from './usb_drive_adapter';

const devsdb = UsbDiskDevPathSchema.decode('/dev/sdb');

const startedDrives: MultiUsbDrive[] = [];

afterEach(() => {
  for (const multiUsbDrive of startedDrives) {
    multiUsbDrive.stop();
  }
  startedDrives.length = 0;
  vi.restoreAllMocks();
});

function newAdapter(
  getDriveDevPath: (
    drives: readonly UsbDriveInfo[]
  ) => UsbDiskDevPath | undefined = (drives) => drives[0]?.diskPath
) {
  const platform = new SimulatedUsbPlatform(makeTemporaryDirectory());
  const multiUsbDrive = detectMultiUsbDrive({
    logger: mockLogger({ fn: vi.fn }),
    platform,
  });
  startedDrives.push(multiUsbDrive);
  const adapter = createUsbDriveAdapter(multiUsbDrive, getDriveDevPath);
  return { platform, multiUsbDrive, adapter };
}

async function insertAndMount(
  platform: SimulatedUsbPlatform,
  multiUsbDrive: MultiUsbDrive,
  fstype: 'fat32' | 'ext4' = 'fat32'
) {
  platform.createDrive({ diskPath: devsdb, fstype });
  platform.insertDrive(devsdb);
  await multiUsbDrive.refresh();
  await vi.waitFor(() => {
    expect(multiUsbDrive.getDrives()[0]?.partition?.mount.type).toEqual(
      'mounted'
    );
  });
}

async function insertUnmountable(
  platform: SimulatedUsbPlatform,
  multiUsbDrive: MultiUsbDrive
) {
  platform.faults.failRepeatedly('mountPartition', new Error('mount failed'));
  platform.createDrive({ diskPath: devsdb, fstype: 'fat32' });
  platform.insertDrive(devsdb);
  await multiUsbDrive.refresh();
  await vi.waitFor(() => {
    expect(multiUsbDrive.getDrives()[0]?.partition?.mount).toEqual(
      UsbPartitionMount.unmounted()
    );
  });
}

describe('status', () => {
  test('returns no_drive when no drives are present', async () => {
    const { adapter } = newAdapter();
    expect(await adapter.status()).toEqual({ status: 'no_drive' });
  });

  test('returns no_drive when getDriveDevPath selects nothing', async () => {
    const { platform, multiUsbDrive, adapter } = newAdapter(() => undefined);
    await insertAndMount(platform, multiUsbDrive);
    expect(await adapter.status()).toEqual({ status: 'no_drive' });
  });

  test('returns no_drive when the selected drive is not present', async () => {
    const { platform, multiUsbDrive, adapter } = newAdapter(() =>
      UsbDiskDevPathSchema.decode('/dev/sdz')
    );
    await insertAndMount(platform, multiUsbDrive);
    expect(await adapter.status()).toEqual({ status: 'no_drive' });
  });

  test('does not offer unformatted drives (no partition) for selection', async () => {
    const getDriveDevPath = vi.fn(
      (drives: readonly UsbDriveInfo[]) => drives[0]?.diskPath
    );
    const { platform, multiUsbDrive, adapter } = newAdapter(getDriveDevPath);

    platform.createDrive({ diskPath: devsdb }); // unformatted: no partition
    platform.insertDrive(devsdb);
    await multiUsbDrive.refresh();

    expect(await adapter.status()).toEqual({ status: 'no_drive' });
    expect(getDriveDevPath).not.toHaveBeenCalled();
  });

  test('returns mounted with the mountpoint for a mounted partition', async () => {
    const { platform, multiUsbDrive, adapter } = newAdapter();
    await insertAndMount(platform, multiUsbDrive);
    expect(await adapter.status()).toEqual({
      status: 'mounted',
      mountpoint: platform.storagePath(devsdb),
    });
  });

  test('returns no_drive for an unmounted partition', async () => {
    const { platform, multiUsbDrive, adapter } = newAdapter();
    await insertUnmountable(platform, multiUsbDrive);
    expect(await adapter.status()).toEqual({ status: 'no_drive' });
  });

  test('returns ejected for an ejected drive', async () => {
    const { platform, multiUsbDrive, adapter } = newAdapter();
    await insertAndMount(platform, multiUsbDrive);
    await multiUsbDrive.ejectDrive(devsdb);
    expect(await adapter.status()).toEqual({ status: 'ejected' });
  });

  test('keeps reporting mounted while a drive is being ejected (unmounting)', async () => {
    const { platform, multiUsbDrive, adapter } = newAdapter();
    await insertAndMount(platform, multiUsbDrive);

    // The unmount runs on a later tick; until it completes the partition is
    // still mounted, so the adapter must keep reporting it as mounted.
    const ejecting = multiUsbDrive.ejectDrive(devsdb);
    expect(await adapter.status()).toEqual({
      status: 'mounted',
      mountpoint: platform.storagePath(devsdb),
    });
    await ejecting;
  });

  test('reports ejected while a drive is being formatted (formatting)', async () => {
    const { platform, multiUsbDrive, adapter } = newAdapter();
    await insertAndMount(platform, multiUsbDrive);

    const formatting = multiUsbDrive.formatDrive(devsdb, 'fat32');
    expect(await adapter.status()).toEqual({ status: 'ejected' });
    await formatting;
  });

  test('returns no_drive while a partition is still mounting', async () => {
    const { platform, multiUsbDrive, adapter } = newAdapter();

    // Hold the platform mount open so the partition stays in the `mounting`
    // state while we observe it.
    const mountStarted = deferred<void>();
    const releaseMount = deferred<void>();
    const realMountPartition = platform.mountPartition.bind(platform);
    vi.spyOn(platform, 'mountPartition').mockImplementation(
      async (partPath) => {
        mountStarted.resolve();
        await releaseMount.promise;
        await realMountPartition(partPath);
      }
    );

    platform.createDrive({ diskPath: devsdb, fstype: 'fat32' });
    platform.insertDrive(devsdb);
    await multiUsbDrive.refresh();
    await mountStarted.promise;

    expect(await adapter.status()).toEqual({ status: 'no_drive' });

    releaseMount.resolve();
    await vi.waitFor(() => {
      expect(multiUsbDrive.getDrives()[0]?.partition?.mount.type).toEqual(
        'mounted'
      );
    });
  });
});

describe('eject', () => {
  test('ejects the selected drive', async () => {
    const { platform, multiUsbDrive, adapter } = newAdapter();
    await insertAndMount(platform, multiUsbDrive);

    await adapter.eject();

    expect(multiUsbDrive.getDrives()[0]?.partition?.mount).toEqual(
      UsbPartitionMount.ejected()
    );
    expect(
      platform.getSimulatedDrives()[0]?.partition?.mountpoint
    ).toBeUndefined();
  });

  test('does nothing when no drive is selected', async () => {
    const { platform, adapter } = newAdapter(() => undefined);
    const unmountPartition = vi.spyOn(platform, 'unmountPartition');

    await adapter.eject();

    expect(unmountPartition).not.toHaveBeenCalled();
  });
});

describe('format', () => {
  test('formats the selected drive', async () => {
    const { platform, multiUsbDrive, adapter } = newAdapter();
    await insertAndMount(platform, multiUsbDrive);

    await adapter.format('ext4');

    expect(platform.getSimulatedDrives()[0]?.partition?.fstype).toEqual('ext4');
    expect(multiUsbDrive.getDrives()[0]?.partition?.mount).toEqual(
      UsbPartitionMount.ejected()
    );
  });

  test('does nothing when no drive is selected', async () => {
    const { platform, adapter } = newAdapter(() => undefined);
    const formatDrive = vi.spyOn(platform, 'formatDrive');

    await adapter.format('fat32');

    expect(formatDrive).not.toHaveBeenCalled();
  });
});

describe('sync', () => {
  test('syncs the mounted partition by mountpoint', async () => {
    const { platform, multiUsbDrive, adapter } = newAdapter();
    await insertAndMount(platform, multiUsbDrive);
    const sync = vi.spyOn(platform, 'sync');

    await adapter.sync();

    expect(sync).toHaveBeenCalledWith(platform.storagePath(devsdb));
  });

  test('does not sync while the partition is unmounting', async () => {
    const { platform, multiUsbDrive, adapter } = newAdapter();
    await insertAndMount(platform, multiUsbDrive);
    const sync = vi.spyOn(platform, 'sync');

    const ejecting = multiUsbDrive.ejectDrive(devsdb);
    await adapter.sync();
    expect(sync).not.toHaveBeenCalled();

    await ejecting;
  });

  test('does not sync an unmounted partition', async () => {
    const { platform, multiUsbDrive, adapter } = newAdapter();
    await insertUnmountable(platform, multiUsbDrive);
    const sync = vi.spyOn(platform, 'sync');

    await adapter.sync();

    expect(sync).not.toHaveBeenCalled();
  });

  test('does nothing when no drive is selected', async () => {
    const { platform, multiUsbDrive, adapter } = newAdapter(() => undefined);
    await insertAndMount(platform, multiUsbDrive);
    const sync = vi.spyOn(platform, 'sync');

    await adapter.sync();

    expect(sync).not.toHaveBeenCalled();
  });

  test('does nothing when the selected drive is not present', async () => {
    const { platform, multiUsbDrive, adapter } = newAdapter(() =>
      UsbDiskDevPathSchema.decode('/dev/sdz')
    );
    await insertAndMount(platform, multiUsbDrive);
    const sync = vi.spyOn(platform, 'sync');

    await adapter.sync();

    expect(sync).not.toHaveBeenCalled();
  });
});
