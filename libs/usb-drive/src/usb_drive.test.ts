import { mockLogger } from '@votingworks/logging';
import {
  BooleanEnvironmentVariableName,
  getFeatureFlagMock,
} from '@votingworks/utils';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, expect, test, vi } from 'vitest';
import { UsbDiskDeviceInfo } from './block_devices';
import {
  getMockUsbDirPath,
  MOCK_USB_DRIVE_STATE_FILENAME,
} from './mocks/file_usb_drive';
import {
  UsbDiskDevPathSchema,
  UsbPartitionDevPathSchema,
  UsbPartitionMountpointSchema,
} from './types';
import { detectUsbDrive } from './usb_drive';

const featureFlagMock = getFeatureFlagMock();

vi.mock(
  import('@votingworks/utils'),
  async (importActual): Promise<typeof import('@votingworks/utils')> => ({
    ...(await importActual()),
    isFeatureFlagEnabled: (flag) => featureFlagMock.isEnabled(flag),
  })
);

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
  featureFlagMock.resetFeatureFlags();
});

test('uses a mock file USB drive when feature flag is set', async () => {
  featureFlagMock.enableFeatureFlag(
    BooleanEnvironmentVariableName.USE_MOCK_USB_DRIVE
  );
  const stateFilePath = join(
    getMockUsbDirPath(),
    'sdb',
    MOCK_USB_DRIVE_STATE_FILENAME
  );

  if (existsSync(stateFilePath)) {
    rmSync(stateFilePath);
  }
  expect(existsSync(stateFilePath)).toEqual(false);

  const usbDrive = detectUsbDrive(mockLogger({ fn: vi.fn }));
  expect(await usbDrive.status()).toEqual({ status: 'no_drive' });
  expect(existsSync(stateFilePath)).toEqual(true);
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
