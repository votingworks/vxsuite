import { mockLogger } from '@votingworks/logging';
import { beforeEach, expect, test, vi } from 'vitest';
import { UsbDiskDeviceInfo } from './block_devices';
import {
  UsbDiskDevPathSchema,
  UsbPartitionDevPathSchema,
  UsbPartitionMountpointSchema,
} from './types';
import { detectUsbDrive } from './usb_drive';
import { UsbPlatform } from './usb_platform';

let mockDevices: UsbDiskDeviceInfo[] = [];

vi.mock('./block_devices', async (importActual) => ({
  ...(await importActual()),
  getAllDiskDevices: vi.fn(() => Promise.resolve(mockDevices)),
  createBlockDeviceChangeWatcher: vi.fn(() => ({ stop: vi.fn() })),
}));

beforeEach(() => {
  mockDevices = [];
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

test('returns no_drive when no drives are connected', async () => {
  const usbDrive = detectUsbDrive(mockLogger({ fn: vi.fn }));
  expect(await usbDrive.status()).toEqual({ status: 'no_drive' });
});

test('exposes the first connected drive via the UsbDrive interface', async () => {
  mockDevices = [
    {
      diskPath: UsbDiskDevPathSchema.decode('/dev/sdb'),
      vendor: undefined,
      model: undefined,
      serial: undefined,
      partitions: [
        {
          partPath: UsbPartitionDevPathSchema.decode('/dev/sdb1'),
          label: 'VxUSB-00000',
          fstype: 'vfat',
          fsver: 'FAT32',
          mountpoint: UsbPartitionMountpointSchema.decode(
            '/media/vx/usb-drive-sdb1'
          ),
        },
      ],
    },
  ];

  const usbDrive = detectUsbDrive(mockLogger({ fn: vi.fn }));

  await vi.waitFor(async () => {
    expect(await usbDrive.status()).toEqual({
      status: 'mounted',
      mountpoint: '/media/vx/usb-drive-sdb1',
    });
  });
});

test('uses an injected platform', async () => {
  const platform: UsbPlatform = {
    getDrives: () =>
      Promise.resolve([
        {
          diskPath: UsbDiskDevPathSchema.decode('/dev/sdz'),
          partition: {
            partPath: UsbPartitionDevPathSchema.decode('/dev/sdz1'),
            fstype: 'fat32',
            mountpoint: UsbPartitionMountpointSchema.decode('/mnt/sdz1'),
          },
        },
      ]),
    watchChanges: () => ({ stop: () => {} }),
    mountPartition: () => Promise.resolve(),
    unmountPartition: () => Promise.resolve(),
    formatDrive: () => Promise.resolve(),
    sync: () => Promise.resolve(),
  };

  const usbDrive = detectUsbDrive(mockLogger({ fn: vi.fn }), { platform });

  await vi.waitFor(async () => {
    expect(await usbDrive.status()).toEqual({
      status: 'mounted',
      mountpoint: '/mnt/sdz1',
    });
  });
});
