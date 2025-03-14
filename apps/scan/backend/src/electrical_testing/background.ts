import fs, { readFile } from 'node:fs/promises';
import path, { join } from 'node:path';

import { saveSheetImages } from '@votingworks/ballot-interpreter';
import {
  assert,
  err,
  extractErrorMessage,
  ok,
  Result,
  sleep,
} from '@votingworks/basics';
import { LogEventId } from '@votingworks/logging';
import { ScannerEvent } from '@votingworks/pdi-scanner';
import { DateTime } from 'luxon';

import { delays } from '../scanners/pdi/state_machine';
import { constructAuthMachineState } from '../util/auth';
import { type ServerContext } from './context';

const CARD_READ_AND_USB_DRIVE_WRITE_INTERVAL_SECONDS = 5;
const PRINT_INTERVAL_SECONDS = 5 * 60;
const USB_DRIVE_FILE_NAME = 'electrical-testing.txt';

function resultToString(result: Result<unknown, unknown>): string {
  return result.isOk()
    ? 'Success'
    : `Error: ${extractErrorMessage(result.err())}`;
}

export async function cardReadAndUsbDriveWriteLoop({
  auth,
  controller,
  logger,
  usbDrive,
  workspace,
}: ServerContext): Promise<void> {
  controller.signal.addEventListener('abort', () => {
    void logger.log(LogEventId.BackgroundTaskCancelled, 'system', {
      message: `Card read and USB drive write loop stopping. Reason: ${controller.signal.reason}`,
    });
  });

  while (!controller.signal.aborted) {
    const machineState = constructAuthMachineState(workspace.store);
    const cardReadResult = await auth.readCardData(machineState);
    workspace.store.setElectricalTestingStatusMessage(
      'card',
      resultToString(cardReadResult)
    );

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

    await sleep(CARD_READ_AND_USB_DRIVE_WRITE_INTERVAL_SECONDS * 1000);
  }
}

export async function printAndScanLoop({
  controller,
  logger,
  printer,
  scannerClient,
  workspace,
}: ServerContext): Promise<void> {
  controller.signal.addEventListener('abort', () => {
    void logger.log(LogEventId.BackgroundTaskCancelled, 'system', {
      message: `Print and scan loop stopping. Reason: ${controller.signal.reason}`,
    });
  });

  const pdfData = await readFile(
    join(__dirname, '../../stress-test-print-page.pdf')
  );
  let lastScanTime: DateTime | undefined;
  let lastPrintTime: DateTime | undefined;
  let shouldResetScanning = true;

  async function onScannerEvent(scannerEvent: ScannerEvent) {
    workspace.store.setElectricalTestingStatusMessage(
      'scanner',
      `Received event: ${scannerEvent.event}`
    );

    if (scannerEvent.event === 'scanComplete') {
      lastScanTime = DateTime.now();

      const [front, back] = scannerEvent.images;
      workspace.store.setElectricalTestingStatusMessage(
        'scanner',
        `Scanned sheet: front=${front.width}×${front.height}, back=${back.width}×${back.height}`
      );

      await saveSheetImages({
        sheetId: `electrical-testing-${lastScanTime.toISO()}`,
        ballotImagesPath: workspace.ballotImagesPath,
        images: scannerEvent.images,
      });
    }

    if (scannerEvent.event === 'error') {
      lastScanTime = undefined;
      shouldResetScanning = true;
      workspace.store.setElectricalTestingStatusMessage(
        'scanner',
        `Scanner error: ${scannerEvent.code}`
      );
    }
  }

  while (!controller.signal.aborted) {
    if (
      !lastPrintTime ||
      DateTime.now().diff(lastPrintTime).as('seconds') > PRINT_INTERVAL_SECONDS
    ) {
      lastPrintTime = DateTime.now();
      workspace.store.setElectricalTestingStatusMessage('printer', 'Printing…');

      try {
        // NOTE: `getStatus` has the side-effect of connecting to the printer,
        // so we must call it before calling `print`.
        const printerStatus = await printer.getStatus();

        if (
          printerStatus.scheme === 'hardware-v4' &&
          printerStatus.state !== 'idle'
        ) {
          workspace.store.setElectricalTestingStatusMessage(
            'printer',
            `Printer is in an unexpected state: ${printerStatus.state}`
          );
        }

        const result = (await printer.print(pdfData)) ?? ok();

        workspace.store.setElectricalTestingStatusMessage(
          'printer',
          resultToString(result)
        );
      } catch (error) {
        workspace.store.setElectricalTestingStatusMessage(
          'printer',
          `Error while printing: ${extractErrorMessage(error)}`
        );
      }
    }

    if (shouldResetScanning) {
      workspace.store.setElectricalTestingStatusMessage(
        'scanner',
        'Resetting scanning'
      );

      try {
        if (scannerClient.isConnected()) {
          await scannerClient.disconnect();
        }
        await scannerClient.connect(onScannerEvent);
        await scannerClient.enableScanning();
        await scannerClient.ejectAndRescanPaperIfPresent();

        workspace.store.setElectricalTestingStatusMessage(
          'scanner',
          'Scanning enabled; waiting for paper'
        );
        shouldResetScanning = false;
      } catch (error) {
        workspace.store.setElectricalTestingStatusMessage(
          'scanner',
          `Error while resetting scanning: ${extractErrorMessage(error)}`
        );
      }
    }

    if (
      lastScanTime &&
      DateTime.now().diff(lastScanTime).as('milliseconds') >
        delays.DELAY_ACCEPTED_READY_FOR_NEXT_BALLOT
    ) {
      await scannerClient.ejectAndRescanPaperIfPresent();

      workspace.store.setElectricalTestingStatusMessage(
        'scanner',
        'Ejected document to re-scan'
      );

      lastScanTime = undefined;
    }

    await sleep(100);
  }

  workspace.store.setElectricalTestingStatusMessage(
    'scanner',
    'Print and scan loop stopping'
  );

  if (scannerClient.isConnected()) {
    await scannerClient.disconnect();
  }

  workspace.store.setElectricalTestingStatusMessage(
    'scanner',
    'Scanner disconnected'
  );
}
