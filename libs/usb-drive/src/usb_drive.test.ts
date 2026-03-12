import { beforeEach, expect, test, vi } from 'vitest';
import { mockLogger } from '@votingworks/logging';
import {
  BooleanEnvironmentVariableName,
  getFeatureFlagMock,
} from '@votingworks/utils';
import { detectOrMockMultiUsbDrive, detectUsbDrive } from './usb_drive';
import { listMockDrives, removeMockDriveDir } from './mocks/file_usb_drive';
import { UsbDiskDeviceInfo } from './block_devices';

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

test('detectOrMockMultiUsbDrive returns file-backed mock when feature flag is set', () => {
  featureFlagMock.enableFeatureFlag(
    BooleanEnvironmentVariableName.USE_MOCK_USB_DRIVE
  );
  const multiUsbDrive = detectOrMockMultiUsbDrive(mockLogger({ fn: vi.fn }));
  // Reads from state file; initializes with no_drive if missing
  expect(multiUsbDrive.getDrives()).toEqual([]);
  multiUsbDrive.stop();
});

test('detectOrMockMultiUsbDrive returns real MultiUsbDrive when feature flag is not set', () => {
  const multiUsbDrive = detectOrMockMultiUsbDrive(mockLogger({ fn: vi.fn }));
  expect(multiUsbDrive.getDrives()).toEqual([]);
  multiUsbDrive.stop();
});

test('uses createMockFileUsbDrive when feature flag is set', async () => {
  featureFlagMock.enableFeatureFlag(
    BooleanEnvironmentVariableName.USE_MOCK_USB_DRIVE
  );

  // Clean up any leftover mock drives
  for (const diskName of listMockDrives()) {
    removeMockDriveDir(diskName);
  }

  const usbDrive = detectUsbDrive(mockLogger({ fn: vi.fn }));
  expect(await usbDrive.status()).toEqual({ status: 'no_drive' });

  // Clean up
  for (const diskName of listMockDrives()) {
    removeMockDriveDir(diskName);
  }
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
