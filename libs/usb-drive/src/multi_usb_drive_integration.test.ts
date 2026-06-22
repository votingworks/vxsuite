// Integration tests running the production `detectMultiUsbDrive` state
// machine against a real `SimulatedUsbPlatform` (no module mocks). These
// guard the `UsbPlatform` contract between the state machine and platform
// implementations — e.g. that unmount/sync are addressed by mountpoint —
// which unit tests with mocked platforms cannot catch.
import { sleep } from '@votingworks/basics';
import { makeTemporaryDirectory } from '@votingworks/fixtures';
import { LogEventId, mockLogger } from '@votingworks/logging';
import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test, vi } from 'vitest';
import { detectMultiUsbDrive } from './multi_usb_drive';
import { SimulatedUsbPlatform } from './mocks/simulated_usb_platform';
import {
  UsbDiskDevPathSchema,
  UsbPartitionDevPathSchema,
  UsbPartitionMount,
} from './types';

const devsdb = UsbDiskDevPathSchema.decode('/dev/sdb');
const devsdb1 = UsbPartitionDevPathSchema.decode('/dev/sdb1');

test('detects and auto-mounts a drive attached before detection starts', async () => {
  const platform = new SimulatedUsbPlatform(makeTemporaryDirectory());
  platform.createDrive({ diskPath: devsdb, fstype: 'fat32' });
  platform.insertDrive(devsdb);

  const multiUsbDrive = detectMultiUsbDrive(mockLogger({ fn: vi.fn }), {
    platform,
  });

  try {
    await vi.waitFor(
      () => {
        expect(multiUsbDrive.getDrives()[0]?.partition?.mount).toEqual(
          UsbPartitionMount.mounted(platform.storagePath(devsdb))
        );
      },
      { timeout: 2000 }
    );
  } finally {
    multiUsbDrive.stop();
  }
});

test('detects an unformatted drive and formats it', async () => {
  const platform = new SimulatedUsbPlatform(makeTemporaryDirectory());
  const logger = mockLogger({ fn: vi.fn });
  const multiUsbDrive = detectMultiUsbDrive(logger, { platform });

  try {
    platform.createDrive({ diskPath: devsdb });
    platform.insertDrive(devsdb);
    await multiUsbDrive.refresh();

    // Reported with no usable partition; nothing to auto-mount.
    expect(multiUsbDrive.getDrives()).toEqual([{ diskPath: devsdb }]);

    await multiUsbDrive.formatDrive(devsdb, 'fat32');

    expect(logger.log).toHaveBeenCalledWith(
      LogEventId.UsbDriveFormatted,
      expect.any(String),
      expect.objectContaining({ disposition: 'success' })
    );
    const partition = platform.getSimulatedDrives()[0]?.partition;
    expect(partition?.fstype).toEqual('fat32');
    expect(partition?.label).toMatch(/^VxUSB-[A-Z0-9]{5}$/);
    // Formatted drives are held ejected until physically re-inserted.
    expect(multiUsbDrive.getDrives()[0]?.partition?.mount).toEqual(
      UsbPartitionMount.ejected()
    );
  } finally {
    multiUsbDrive.stop();
  }
});

test('full lifecycle: insert → auto-mount → write → sync → eject → format → remove → re-insert', async () => {
  const platform = new SimulatedUsbPlatform(makeTemporaryDirectory());
  const logger = mockLogger({ fn: vi.fn });
  const multiUsbDrive = detectMultiUsbDrive(logger, { platform });

  try {
    await multiUsbDrive.refresh();
    expect(multiUsbDrive.getDrives()).toEqual([]);

    platform.createDrive({
      diskPath: devsdb,
      fstype: 'fat32',
      label: 'VxUSB-ABCDE',
    });
    platform.insertDrive(devsdb);
    await multiUsbDrive.refresh();

    const mountpoint = platform.storagePath(devsdb);
    await vi.waitFor(
      () => {
        expect(multiUsbDrive.getDrives()[0]?.partition?.mount).toEqual(
          UsbPartitionMount.mounted(mountpoint)
        );
      },
      { timeout: 2000 }
    );
    expect(logger.log).toHaveBeenCalledWith(
      LogEventId.UsbDriveMounted,
      expect.any(String),
      expect.objectContaining({ disposition: 'success' })
    );

    // Write data through the mounted filesystem and flush it
    await writeFile(join(mountpoint, 'README'), 'hello');
    await multiUsbDrive.sync(devsdb1);

    // Eject unmounts via the platform and reports the partition as ejected
    await multiUsbDrive.ejectDrive(devsdb);
    expect(multiUsbDrive.getDrives()[0]?.partition?.mount).toEqual(
      UsbPartitionMount.ejected()
    );
    expect(
      platform.getSimulatedDrives()[0]?.partition?.mountpoint
    ).toBeUndefined();
    expect(logger.log).toHaveBeenCalledWith(
      LogEventId.UsbDriveEjected,
      expect.any(String),
      expect.objectContaining({ disposition: 'success' })
    );

    // Ejecting preserves the drive's data and prevents auto-remount
    expect(existsSync(join(mountpoint, 'README'))).toEqual(true);
    await multiUsbDrive.refresh();
    await sleep(50);
    expect(multiUsbDrive.getDrives()[0]?.partition?.mount).toEqual(
      UsbPartitionMount.ejected()
    );

    // Format preserves the VxUSB label and wipes the drive's data
    await multiUsbDrive.formatDrive(devsdb, 'fat32');
    expect(logger.log).toHaveBeenCalledWith(
      LogEventId.UsbDriveFormatted,
      expect.any(String),
      expect.objectContaining({
        disposition: 'success',
        message: expect.stringContaining('VxUSB-ABCDE'),
      })
    );
    expect(platform.getSimulatedDrives()[0]?.partition?.label).toEqual(
      'VxUSB-ABCDE'
    );
    expect(existsSync(join(mountpoint, 'README'))).toEqual(false);

    // Unplugging the drive is detected via the platform watcher (no explicit
    // refresh) and the drive disappears
    platform.removeDrive(devsdb);
    await vi.waitFor(
      () => {
        expect(multiUsbDrive.getDrives()).toEqual([]);
      },
      { timeout: 2000 }
    );

    // Re-inserting clears the eject state and auto-mounts again
    platform.insertDrive(devsdb);
    await multiUsbDrive.refresh();
    await vi.waitFor(
      () => {
        expect(multiUsbDrive.getDrives()[0]?.partition?.mount).toEqual(
          UsbPartitionMount.mounted(mountpoint)
        );
      },
      { timeout: 2000 }
    );
  } finally {
    multiUsbDrive.stop();
  }
});
