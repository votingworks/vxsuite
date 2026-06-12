import { describe, expect, test, vi } from 'vitest';
import { createUsbDriveAdapter } from './usb_drive_adapter';
import { createMockMultiUsbDrive } from './mocks/mock_multi_usb_drive';
import {
  UsbDiskDevPathSchema,
  UsbDriveInfo,
  UsbDriveStatus,
  UsbPartitionDevPathSchema,
  UsbPartitionMount,
  UsbPartitionMountpointSchema,
} from './types';

const devsdb = UsbDiskDevPathSchema.decode('/dev/sdb');
const devsdb1 = UsbPartitionDevPathSchema.decode('/dev/sdb1');
const mountpointSdb1 = UsbPartitionMountpointSchema.decode(
  '/media/vx/usb-drive-sdb1'
);

function makeDriveInfo(overrides: Partial<UsbDriveInfo> = {}): UsbDriveInfo {
  return {
    diskPath: devsdb,
    partition: {
      diskPath: devsdb,
      partPath: devsdb1,
      label: 'VxUSB-ABCDE',
      fstype: 'fat32',
      mount: UsbPartitionMount.mounted(mountpointSdb1),
    },
    ...overrides,
  };
}

describe('createUsbDriveAdapter', () => {
  describe('status', () => {
    test('returns no_drive when getDriveDevPath returns undefined', async () => {
      const { multiUsbDrive } = createMockMultiUsbDrive();
      const adapter = createUsbDriveAdapter(multiUsbDrive, () => undefined);
      multiUsbDrive.getDrives.reset();

      multiUsbDrive.getDrives.expectRepeatedCallsWith().returns([]);
      expect(await adapter.status()).toEqual({ status: 'no_drive' });
    });

    test('returns no_drive when drive not found in getDrives()', async () => {
      const { multiUsbDrive } = createMockMultiUsbDrive();
      const adapter = createUsbDriveAdapter(multiUsbDrive, () =>
        UsbDiskDevPathSchema.decode('/dev/sdz')
      );
      multiUsbDrive.getDrives.reset();

      multiUsbDrive.getDrives
        .expectRepeatedCallsWith()
        .returns([makeDriveInfo()]);
      expect(await adapter.status()).toEqual({ status: 'no_drive' });
    });

    test('returns no_drive when no drive is selected', async () => {
      const { multiUsbDrive } = createMockMultiUsbDrive();
      const adapter = createUsbDriveAdapter(multiUsbDrive, () => undefined);
      multiUsbDrive.getDrives.reset();

      multiUsbDrive.getDrives
        .expectRepeatedCallsWith()
        .returns([makeDriveInfo()]);
      expect(await adapter.status()).toEqual({ status: 'no_drive' });
    });

    test('only allows selecting a drive with a single partition', async () => {
      const { multiUsbDrive } = createMockMultiUsbDrive();
      const adapter = createUsbDriveAdapter(
        multiUsbDrive,
        vi.fn().mockThrow(new Error('should never be called'))
      );
      multiUsbDrive.getDrives.reset();

      multiUsbDrive.getDrives
        .expectRepeatedCallsWith()
        .returns([makeDriveInfo({ partition: undefined })]);
      expect(await adapter.status()).toEqual({ status: 'no_drive' });
    });

    test('can see ext4 drives', async () => {
      const { multiUsbDrive } = createMockMultiUsbDrive();
      const adapter = createUsbDriveAdapter(
        multiUsbDrive,
        (drives) => drives[0]?.diskPath
      );
      multiUsbDrive.getDrives.reset();

      multiUsbDrive.getDrives.expectRepeatedCallsWith().returns([
        makeDriveInfo({
          partition: {
            diskPath: devsdb,
            partPath: devsdb1,
            fstype: 'ext4',
            mount: UsbPartitionMount.mounted(mountpointSdb1),
          },
        }),
      ]);
      expect(await adapter.status()).toEqual<UsbDriveStatus>({
        status: 'mounted',
        mountpoint: mountpointSdb1,
      });
    });

    test('returns no_drive when partition is mounting', async () => {
      const { multiUsbDrive } = createMockMultiUsbDrive();
      const adapter = createUsbDriveAdapter(multiUsbDrive, () => devsdb);
      multiUsbDrive.getDrives.reset();

      multiUsbDrive.getDrives.expectRepeatedCallsWith().returns([
        makeDriveInfo({
          partition: {
            diskPath: devsdb,
            partPath: devsdb1,
            fstype: 'fat32',
            mount: UsbPartitionMount.mounting(),
          },
        }),
      ]);
      expect(await adapter.status()).toEqual({ status: 'no_drive' });
    });

    test('returns mounted when partition is mounted', async () => {
      const { multiUsbDrive } = createMockMultiUsbDrive();
      const adapter = createUsbDriveAdapter(multiUsbDrive, () => devsdb);
      multiUsbDrive.getDrives.reset();

      multiUsbDrive.getDrives
        .expectRepeatedCallsWith()
        .returns([makeDriveInfo()]);
      expect(await adapter.status()).toEqual({
        status: 'mounted',
        mountpoint: mountpointSdb1,
      });
    });

    test('returns no_drive for unmounted partition', async () => {
      const { multiUsbDrive } = createMockMultiUsbDrive();
      const adapter = createUsbDriveAdapter(multiUsbDrive, () => devsdb);
      multiUsbDrive.getDrives.reset();

      multiUsbDrive.getDrives.expectRepeatedCallsWith().returns([
        makeDriveInfo({
          partition: {
            diskPath: devsdb,
            partPath: devsdb1,
            fstype: 'fat32',
            mount: UsbPartitionMount.unmounted(),
          },
        }),
      ]);
      expect(await adapter.status()).toEqual({ status: 'no_drive' });
    });

    test('returns ejected when partition mount type is ejected', async () => {
      const { multiUsbDrive, assertComplete } = createMockMultiUsbDrive();
      const adapter = createUsbDriveAdapter(multiUsbDrive, () => devsdb);
      multiUsbDrive.getDrives.reset();

      multiUsbDrive.getDrives.expectRepeatedCallsWith().returns([
        makeDriveInfo({
          partition: {
            diskPath: devsdb,
            partPath: devsdb1,
            fstype: 'fat32',
            mount: UsbPartitionMount.ejected(),
          },
        }),
      ]);
      expect(await adapter.status()).toEqual({ status: 'ejected' });

      assertComplete();
    });

    test('returns ejected when partition is formatting', async () => {
      const { multiUsbDrive } = createMockMultiUsbDrive();
      const adapter = createUsbDriveAdapter(multiUsbDrive, () => devsdb);
      multiUsbDrive.getDrives.reset();

      multiUsbDrive.getDrives.expectRepeatedCallsWith().returns([
        makeDriveInfo({
          partition: {
            diskPath: devsdb,
            partPath: devsdb1,
            fstype: 'fat32',
            mount: UsbPartitionMount.formatting(),
          },
        }),
      ]);
      expect(await adapter.status()).toEqual({ status: 'ejected' });
    });

    test('returns mounted when partition is unmounting', async () => {
      const { multiUsbDrive } = createMockMultiUsbDrive();
      const adapter = createUsbDriveAdapter(multiUsbDrive, () => devsdb);
      multiUsbDrive.getDrives.reset();

      multiUsbDrive.getDrives.expectRepeatedCallsWith().returns([
        makeDriveInfo({
          partition: {
            diskPath: devsdb,
            partPath: devsdb1,
            fstype: 'fat32',
            mount: UsbPartitionMount.unmounting(mountpointSdb1),
          },
        }),
      ]);
      expect(await adapter.status()).toEqual({
        status: 'mounted',
        mountpoint: mountpointSdb1,
      });
    });
  });

  describe('eject', () => {
    test('calls ejectDrive on the multiUsbDrive', async () => {
      const { multiUsbDrive, assertComplete } = createMockMultiUsbDrive();
      const adapter = createUsbDriveAdapter(multiUsbDrive, () => devsdb);
      multiUsbDrive.getDrives.reset();
      multiUsbDrive.getDrives.expectRepeatedCallsWith().returns([]);

      multiUsbDrive.ejectDrive.expectCallWith(devsdb).resolves();
      await adapter.eject();

      assertComplete();
    });

    test('does nothing when no drive dev path', async () => {
      const { multiUsbDrive, assertComplete } = createMockMultiUsbDrive();
      const adapter = createUsbDriveAdapter(multiUsbDrive, () => undefined);
      multiUsbDrive.getDrives.reset();
      multiUsbDrive.getDrives.expectRepeatedCallsWith().returns([]);

      await adapter.eject();

      assertComplete();
    });
  });

  describe('format', () => {
    test('calls formatDrive on the multiUsbDrive', async () => {
      const { multiUsbDrive, assertComplete } = createMockMultiUsbDrive();
      const adapter = createUsbDriveAdapter(multiUsbDrive, () => devsdb);
      multiUsbDrive.getDrives.reset();
      multiUsbDrive.getDrives.expectRepeatedCallsWith().returns([]);

      multiUsbDrive.formatDrive.expectCallWith(devsdb, 'fat32').resolves();
      await adapter.format('fat32');

      assertComplete();
    });

    test('does nothing when no drive dev path', async () => {
      const { multiUsbDrive, assertComplete } = createMockMultiUsbDrive();
      const adapter = createUsbDriveAdapter(multiUsbDrive, () => undefined);
      multiUsbDrive.getDrives.reset();
      multiUsbDrive.getDrives.expectRepeatedCallsWith().returns([]);

      await adapter.format('fat32');

      assertComplete();
    });
  });

  describe('sync', () => {
    test('calls sync on the mounted partition', async () => {
      const { multiUsbDrive, assertComplete } = createMockMultiUsbDrive();
      const adapter = createUsbDriveAdapter(multiUsbDrive, () => devsdb);
      multiUsbDrive.getDrives.reset();

      multiUsbDrive.getDrives
        .expectRepeatedCallsWith()
        .returns([makeDriveInfo()]);
      multiUsbDrive.sync.expectCallWith(devsdb1).resolves();
      await adapter.sync();

      assertComplete();
    });

    test('does nothing while partition is unmounting', async () => {
      const { multiUsbDrive, assertComplete } = createMockMultiUsbDrive();
      const adapter = createUsbDriveAdapter(multiUsbDrive, () => devsdb);
      multiUsbDrive.getDrives.reset();

      multiUsbDrive.getDrives.expectRepeatedCallsWith().returns([
        makeDriveInfo({
          partition: {
            diskPath: devsdb,
            partPath: devsdb1,
            fstype: 'fat32',
            mount: UsbPartitionMount.unmounting(mountpointSdb1),
          },
        }),
      ]);
      await adapter.sync();

      assertComplete();
    });

    test('does nothing when no mounted partition', async () => {
      const { multiUsbDrive, assertComplete } = createMockMultiUsbDrive();
      const adapter = createUsbDriveAdapter(multiUsbDrive, () => devsdb);
      multiUsbDrive.getDrives.reset();

      multiUsbDrive.getDrives.expectRepeatedCallsWith().returns([
        makeDriveInfo({
          partition: {
            diskPath: devsdb,
            partPath: devsdb1,
            fstype: 'fat32',
            mount: UsbPartitionMount.unmounted(),
          },
        }),
      ]);
      await adapter.sync();

      assertComplete();
    });

    test('does nothing when no drive dev path', async () => {
      const { multiUsbDrive, assertComplete } = createMockMultiUsbDrive();
      const adapter = createUsbDriveAdapter(multiUsbDrive, () => undefined);
      multiUsbDrive.getDrives.reset();
      multiUsbDrive.getDrives.expectRepeatedCallsWith().returns([]);

      await adapter.sync();

      assertComplete();
    });

    test('does nothing when drive not found', async () => {
      const { multiUsbDrive, assertComplete } = createMockMultiUsbDrive();
      const adapter = createUsbDriveAdapter(multiUsbDrive, () => devsdb);
      multiUsbDrive.getDrives.reset();

      multiUsbDrive.getDrives.expectRepeatedCallsWith().returns([]);
      await adapter.sync();

      assertComplete();
    });
  });
});
