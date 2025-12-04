/* istanbul ignore file - @preserve */
import React from 'react';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';

import {
  assert,
  err,
  extractErrorMessage,
  ok,
  Result,
  sleep,
} from '@votingworks/basics';
import { LogEventId } from '@votingworks/logging';
import { renderToPdf } from '@votingworks/printing';
import { ServerContext } from './context';
import { constructAuthMachineState } from '../util/auth';
import { getMachineConfig } from '../machine_config';
import { TestPrintPage } from './test_print_page';

const CARD_READ_AND_USB_DRIVE_WRITE_INTERVAL_SECONDS = 5;
const PRINTER_TEST_INTERVAL_SECONDS = 5 * 60; // 5 minutes
export const USB_DRIVE_FILE_NAME = 'electrical-testing.txt';

function resultToString(result: Result<unknown, unknown>): string {
  return result.isOk()
    ? 'Success'
    : `Error: ${extractErrorMessage(result.err())}`;
}

export async function runCardReadAndUsbDriveWriteTask({
  auth,
  usbDrive,
  cardTask,
  usbDriveTask,
  logger,
  workspace,
}: ServerContext): Promise<void> {
  void cardTask.waitUntilIsStopped().then((reason) => {
    const message = `Card read loop stopping. Reason: ${reason}`;
    logger.log(LogEventId.BackgroundTaskCancelled, 'system', {
      message,
    });
    workspace.store.setElectricalTestingStatusMessage('card', message);
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
      const machineState = constructAuthMachineState(workspace);
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
          join(usbDriveStatus.mountPoint, USB_DRIVE_FILE_NAME),
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

/**
 * Sends a single test print to the printer.
 * Returns success or error message.
 */
export async function sendTestPrint(
  printer: ServerContext['printer']
): Promise<{ success: boolean; message: string }> {
  try {
    const printerStatus = await printer.status();
    if (!printerStatus.connected) {
      return { success: false, message: 'Printer not connected' };
    }

    const timestamp = new Date();
    const { machineId } = getMachineConfig();

    const document = React.createElement(TestPrintPage, {
      timestamp,
      machineId,
    });

    const pdfResult = await renderToPdf({ document });
    if (pdfResult.isErr()) {
      return {
        success: false,
        message: `Failed to render test page: ${pdfResult.err()}`,
      };
    }

    await printer.print({ data: pdfResult.ok() });

    return { success: true, message: 'Test print sent successfully' };
  } catch (error) {
    return {
      success: false,
      message: `Print failed: ${extractErrorMessage(error)}`,
    };
  }
}

export async function runPrinterTestTask({
  printer,
  printerTask,
  logger,
  workspace,
}: ServerContext): Promise<void> {
  void printerTask.waitUntilIsStopped().then((reason) => {
    const message = `Printer test loop stopping. Reason: ${reason}`;
    logger.log(LogEventId.BackgroundTaskCancelled, 'system', {
      message,
    });
    workspace.store.setElectricalTestingStatusMessage('printer', message);
  });

  let lastPrintTime = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (printerTask.isStopped()) {
      break;
    }

    await printerTask.waitUntilIsRunning();

    const now = Date.now();
    const timeSinceLastPrint = (now - lastPrintTime) / 1000;

    // Only print if enough time has passed since the last print
    if (timeSinceLastPrint >= PRINTER_TEST_INTERVAL_SECONDS) {
      const result = await sendTestPrint(printer);
      if (result.success) {
        lastPrintTime = now;
      }
      workspace.store.setElectricalTestingStatusMessage(
        'printer',
        result.message
      );
    }

    // Wait for the next check interval or until task is stopped
    await Promise.race([
      sleep(10 * 1000), // Check every 10 seconds
      printerTask.waitUntilIsStopped(),
    ]);
  }
}
