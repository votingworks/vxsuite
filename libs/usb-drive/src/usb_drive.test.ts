import { makeTemporaryDirectory } from '@votingworks/fixtures';
import { mockLogger } from '@votingworks/logging';
import { expect, test, vi } from 'vitest';
import { SimulatedUsbPlatform } from './mocks/simulated_usb_platform.js';
import { mountedUsbDriveStatus, UsbDiskDevPathSchema } from './types.js';
import { detectUsbDrive } from './usb_drive.js';

test('returns no_drive when no drives are connected', async () => {
  const platform = new SimulatedUsbPlatform(makeTemporaryDirectory());
  const usbDrive = detectUsbDrive({
    logger: mockLogger({ fn: vi.fn }),
    platform,
  });
  expect(await usbDrive.status()).toEqual({ status: 'no_drive' });
});

test.each(['exfat', 'fat32'] as const)(
  'exposes the first $0 drive via the UsbDrive interface',
  async (fstype) => {
    const platform = new SimulatedUsbPlatform(makeTemporaryDirectory());
    const usbDrive = detectUsbDrive({
      logger: mockLogger({ fn: vi.fn }),
      platform,
    });

    expect(await usbDrive.status()).toEqual({ status: 'no_drive' });

    const devsdb = UsbDiskDevPathSchema.decode('/dev/sdb');
    platform.createDrive({ diskPath: devsdb, fstype });
    platform.insertDrive(devsdb);

    await vi.waitFor(async () => {
      expect(await usbDrive.status()).toEqual(
        mountedUsbDriveStatus(platform.storagePath(devsdb), fstype, {
          totalBytes: expect.any(Number),
          availableBytes: expect.any(Number),
        })
      );
    });
  }
);

test('ignores backup (ext4) drives', async () => {
  const platform = new SimulatedUsbPlatform(makeTemporaryDirectory());
  const usbDrive = detectUsbDrive({
    logger: mockLogger({ fn: vi.fn }),
    platform,
  });

  const devsdb = UsbDiskDevPathSchema.decode('/dev/sdb');
  platform.createDrive({ diskPath: devsdb, fstype: 'ext4' });
  platform.insertDrive(devsdb);

  await vi.waitFor(async () => {
    const [drive] = await platform.getDrives();
    expect(drive?.partition?.mountpoint).toBeDefined();
  });
  expect(await usbDrive.status()).toEqual({ status: 'no_drive' });
});
