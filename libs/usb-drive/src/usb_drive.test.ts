import { beforeEach, expect, test, vi } from 'vitest';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { mockLogger } from '@votingworks/logging';
import {
  BooleanEnvironmentVariableName,
  getFeatureFlagMock,
} from '@votingworks/utils';
import { detectUsbDrive } from './usb_drive';
import { UsbDiskDeviceInfo } from './block_devices';
import {
  getMockUsbDirPath,
  MOCK_USB_DRIVE_STATE_FILENAME,
} from './mocks/file_usb_drive';

const featureFlagMock = getFeatureFlagMock();

vi.mock(
  import('@votingworks/utils'),
  async (importActual): Promise<typeof import('@votingworks/utils')> => ({
    ...(await importActual()),
    isFeatureFlagEnabled: (flag) => featureFlagMock.isEnabled(flag),
  })
);

let mockDrives: UsbDiskDeviceInfo[] = [];

vi.mock('./block_devices', async (importActual) => ({
  ...(await importActual()),
  getAllUsbDrives: vi.fn(() => Promise.resolve(mockDrives)),
  createBlockDeviceChangeWatcher: vi.fn(() => ({ stop: vi.fn() })),
}));

beforeEach(() => {
  mockDrives = [];
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  featureFlagMock.resetFeatureFlags();
});

test('uses MockFileUsbDrive when feature flag is set', async () => {
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
  mockDrives = [
    {
      devPath: '/dev/sdb',
      vendor: undefined,
      model: undefined,
      serial: undefined,
      partitions: [
        {
          devPath: '/dev/sdb1',
          label: 'VxUSB-00000',
          fstype: 'vfat',
          fsver: 'FAT32',
          mountpoint: '/media/vx/usb-drive-sdb1',
        },
      ],
    },
  ];

  const usbDrive = detectUsbDrive(mockLogger({ fn: vi.fn }));

  // doRefresh() is fired asynchronously but only awaits Promise.resolve(mockDrives),
  // so one microtask tick is enough for it to complete and populate the drive cache.
  await Promise.resolve();

  expect(await usbDrive.status()).toEqual({
    status: 'mounted',
    mountPoint: '/media/vx/usb-drive-sdb1',
  });
});
