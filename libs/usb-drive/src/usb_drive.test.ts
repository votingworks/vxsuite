import { makeTemporaryDirectory } from '@votingworks/fixtures';
import { mockLogger } from '@votingworks/logging';
import { expect, test, vi } from 'vitest';
import { SimulatedUsbPlatform } from './mocks/simulated_usb_platform';
import { UsbDiskDevPathSchema } from './types';
import { detectUsbDrive } from './usb_drive';

test('returns no_drive when no drives are connected', async () => {
  const platform = new SimulatedUsbPlatform(makeTemporaryDirectory());
  const usbDrive = detectUsbDrive({
    logger: mockLogger({ fn: vi.fn }),
    platform,
  });
  expect(await usbDrive.status()).toEqual({ status: 'no_drive' });
});

test('exposes the first FAT32 drive via the UsbDrive interface', async () => {
  const platform = new SimulatedUsbPlatform(makeTemporaryDirectory());
  const usbDrive = detectUsbDrive({
    logger: mockLogger({ fn: vi.fn }),
    platform,
  });

  expect(await usbDrive.status()).toEqual({ status: 'no_drive' });

  const devsdb = UsbDiskDevPathSchema.decode('/dev/sdb');
  platform.createDrive({ diskPath: devsdb, fstype: 'fat32' });
  platform.insertDrive(devsdb);

  await vi.waitFor(async () => {
    expect(await usbDrive.status()).toEqual({
      status: 'mounted',
      mountpoint: platform.storagePath(devsdb),
    });
  });
});
