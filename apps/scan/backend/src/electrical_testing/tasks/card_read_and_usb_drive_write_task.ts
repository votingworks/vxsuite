import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { assert, err, ok, Result, sleep } from '@votingworks/basics';
import { LogEventId } from '@votingworks/logging';
import { constructAuthMachineState } from '../../util/auth';
import { ServerContext } from '../context';
import { resultToString } from '../utils';

export const CARD_READ_AND_USB_DRIVE_WRITE_INTERVAL_SECONDS = 5;
export const USB_DRIVE_FILE_NAME = 'electrical-testing.txt';

export async function runCardReadAndUsbDriveWriteTask({
  auth,
  cardTask,
  logger,
  usbDrive,
  usbDriveTask,
  workspace,
}: ServerContext): Promise<void> {
  void cardTask.waitUntilIsStopped().then((reason) => {
    logger.log(LogEventId.BackgroundTaskCancelled, 'system', {
      message: `Card read loop stopping. Reason: ${reason}`,
    });
  });

  void usbDriveTask.waitUntilIsStopped().then((reason) => {
    logger.log(LogEventId.BackgroundTaskCancelled, 'system', {
      message: `USB drive write loop stopping. Reason: ${reason}`,
    });
  });

  // eslint-disable-next-line no-constant-condition
  while (true) {
    // Exit the loop if both tasks are stopped.
    if (cardTask.isStopped() && usbDriveTask.isStopped()) {
      break;
    }

    // Wait for at least one task to be running.
    await Promise.race([
      cardTask.waitUntilIsRunning(),
      usbDriveTask.waitUntilIsRunning(),
    ]);

    if (cardTask.isRunning()) {
      const machineState = constructAuthMachineState(workspace.store);
      const cardReadResult = await auth.readCardData(machineState);
      workspace.store.setElectricalTestingStatusMessage(
        'card',
        resultToString(cardReadResult)
      );
    }

    if (usbDriveTask.isRunning()) {
      let usbDriveWriteResult: Result<void, unknown> = ok();
      try {
        const usbDriveStatus = await usbDrive.status();
        assert(usbDriveStatus.status === 'mounted', 'USB drive not mounted');
        await fs.appendFile(
          path.join(usbDriveStatus.mountPoint, USB_DRIVE_FILE_NAME),
          `${new Date().toISOString()}\n`
        );
      } catch (error) {
        usbDriveWriteResult = err(error);
      }
      workspace.store.setElectricalTestingStatusMessage(
        'usbDrive',
        resultToString(usbDriveWriteResult)
      );
    }

    // Wait for the next interval or until both loops are stopped.
    await Promise.race([
      sleep(CARD_READ_AND_USB_DRIVE_WRITE_INTERVAL_SECONDS * 1000),
      Promise.all([
        cardTask.waitUntilIsStopped(),
        usbDriveTask.waitUntilIsStopped(),
      ]),
    ]);
  }
}
