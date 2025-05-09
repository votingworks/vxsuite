import { err, ok } from '@votingworks/basics';
import { LogEventId } from '@votingworks/logging';
import { UsbDrive } from '@votingworks/usb-drive';
import { exists } from 'fs-extra';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, vi } from 'vitest';
import { test } from '../../../test/helpers/test';
import {
  CARD_READ_AND_USB_DRIVE_WRITE_INTERVAL_SECONDS,
  runCardReadAndUsbDriveWriteTask,
  USB_DRIVE_FILE_NAME,
} from './card_read_and_usb_drive_write_task';

async function hasWrittenFileToUsbDrive(usbDrive: UsbDrive) {
  const status = await usbDrive.status();
  return (
    status.status === 'mounted' &&
    exists(join(status.mountPoint, USB_DRIVE_FILE_NAME))
  );
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
});

test.electrical(
  'logs when loops are stopped',
  async ({ electricalAppContext }) => {
    electricalAppContext.cardTask.stop();
    electricalAppContext.usbDriveTask.stop();
    await runCardReadAndUsbDriveWriteTask(electricalAppContext);

    await vi.waitFor(() => {
      expect(electricalAppContext.logger.log).toHaveBeenCalledWith(
        LogEventId.BackgroundTaskCancelled,
        'system',
        { message: expect.stringContaining('Card read loop stopping') }
      );
    });

    await vi.waitFor(() => {
      expect(electricalAppContext.logger.log).toHaveBeenCalledWith(
        LogEventId.BackgroundTaskCancelled,
        'system',
        { message: expect.stringContaining('USB drive write loop stopping') }
      );
    });
  }
);

test.electrical(
  'does not read card data when card reading is paused',
  async ({ electricalAppContext, mainAppContext }) => {
    mainAppContext.mockUsbDrive.insertUsbDrive({});
    mainAppContext.mockAuth.readCardData.mockResolvedValue(
      err(new Error('no readCardData call expected'))
    );

    // Pause card reading.
    electricalAppContext.cardTask.pause();
    await expect(
      hasWrittenFileToUsbDrive(mainAppContext.mockUsbDrive.usbDrive)
    ).resolves.toBe(false);

    // Start the loop.
    const runLoopPromise =
      runCardReadAndUsbDriveWriteTask(electricalAppContext);

    // Wait for the loop to go at least once.
    await vi.waitUntil(() =>
      hasWrittenFileToUsbDrive(mainAppContext.mockUsbDrive.usbDrive)
    );
    await vi.waitFor(() => {
      expect(
        mainAppContext.workspace.store.getElectricalTestingStatusMessages()
      ).toEqual([expect.objectContaining({ component: 'usbDrive' })]);
    });

    // Stop the loop.
    electricalAppContext.cardTask.stop();
    electricalAppContext.usbDriveTask.stop();
    await runLoopPromise;
  }
);

test.electrical(
  'does not write to the USB drive when USB writing is paused',
  async ({ electricalAppContext, mainAppContext }) => {
    mainAppContext.mockUsbDrive.insertUsbDrive({});
    mainAppContext.mockAuth.readCardData.mockResolvedValue(ok('card data'));
    await expect(
      hasWrittenFileToUsbDrive(mainAppContext.mockUsbDrive.usbDrive)
    ).resolves.toBe(false);
    expect(
      mainAppContext.workspace.store.getElectricalTestingStatusMessages()
    ).toEqual([]);

    // Pause USB writing.
    electricalAppContext.usbDriveTask.pause();

    // Start the loop.
    const runLoopPromise =
      runCardReadAndUsbDriveWriteTask(electricalAppContext);

    // Wait for the loop to go at least once.
    await vi.waitUntil(
      () => mainAppContext.mockAuth.readCardData.mock.calls.length > 0
    );
    await vi.waitFor(() => {
      expect(
        mainAppContext.workspace.store.getElectricalTestingStatusMessages()
      ).toEqual([expect.objectContaining({ component: 'card' })]);
    });
    await expect(
      hasWrittenFileToUsbDrive(mainAppContext.mockUsbDrive.usbDrive)
    ).resolves.toBe(false);

    // Stop the loop.
    electricalAppContext.cardTask.stop();
    electricalAppContext.usbDriveTask.stop();
    await runLoopPromise;
  }
);

test.electrical(
  'performs both card and USB drive operations multiple times',
  async ({ electricalAppContext, mainAppContext }) => {
    mainAppContext.mockUsbDrive.insertUsbDrive({});
    mainAppContext.mockAuth.readCardData.mockResolvedValue(ok('card data'));

    // Start the loop.
    const runLoopPromise =
      runCardReadAndUsbDriveWriteTask(electricalAppContext);

    // Wait for the loop to go a few times.
    await vi.waitUntil(() => {
      vi.advanceTimersByTime(
        CARD_READ_AND_USB_DRIVE_WRITE_INTERVAL_SECONDS * 1000
      );
      return mainAppContext.mockAuth.readCardData.mock.calls.length > 2;
    });
    await vi.waitFor(() => {
      expect(
        mainAppContext.workspace.store
          .getElectricalTestingStatusMessages()
          .map(({ component }) => component)
          .sort()
      ).toEqual(['card', 'usbDrive']);
    });
    await expect(
      hasWrittenFileToUsbDrive(mainAppContext.mockUsbDrive.usbDrive)
    ).resolves.toBe(true);

    // Stop the loop.
    electricalAppContext.cardTask.stop();
    electricalAppContext.usbDriveTask.stop();
    await runLoopPromise;
  }
);

test.electrical(
  'writes error status if the USB drive is not mounted',
  async ({ electricalAppContext, mainAppContext }) => {
    mainAppContext.mockUsbDrive.removeUsbDrive();
    mainAppContext.mockAuth.readCardData.mockResolvedValue(ok('card data'));

    // Start the loop.
    const runLoopPromise =
      runCardReadAndUsbDriveWriteTask(electricalAppContext);

    // Wait for the loop to go a few times.
    await vi.waitUntil(() => {
      vi.advanceTimersByTime(
        CARD_READ_AND_USB_DRIVE_WRITE_INTERVAL_SECONDS * 1000
      );
      return mainAppContext.mockAuth.readCardData.mock.calls.length > 2;
    });
    await vi.waitFor(() => {
      expect(
        mainAppContext.workspace.store.getElectricalTestingStatusMessages()
      ).toContainEqual(
        expect.objectContaining({
          component: 'usbDrive',
          statusMessage: expect.stringContaining(
            'Error: USB drive not mounted'
          ),
        })
      );
    });

    // Stop the loop.
    electricalAppContext.cardTask.stop();
    electricalAppContext.usbDriveTask.stop();
    await runLoopPromise;
  }
);
