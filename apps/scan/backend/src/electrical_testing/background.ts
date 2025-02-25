import fs from 'node:fs/promises';
import path from 'node:path';

import { DateTime } from 'luxon';
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

import { constructAuthMachineState } from '../util/auth';
import { type ServerContext } from './context';
import { delays } from '../scanners/pdi/state_machine';

const CARD_READ_AND_USB_DRIVE_WRITE_INTERVAL_SECONDS = 5;
const USB_DRIVE_FILE_NAME = 'electrical-testing.txt';

function resultToString(result: Result<unknown, unknown>): string {
  return result.isOk()
    ? 'Success'
    : `Error: ${extractErrorMessage(result.err())}`;
}

export async function cardReadAndUsbDriveWriteLoop({
  auth,
  usbDrive,
  workspace,
  controller,
  logger,
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
  workspace,
  controller,
  logger,
  scannerClient,
}: ServerContext): Promise<void> {
  controller.signal.addEventListener('abort', () => {
    void logger.log(LogEventId.BackgroundTaskCancelled, 'system', {
      message: `Print and scan loop stopping. Reason: ${controller.signal.reason}`,
    });
  });

  let lastScanTime: DateTime | undefined;
  let shouldResetScanning = false;

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
      shouldResetScanning = true;
      workspace.store.setElectricalTestingStatusMessage(
        'scanner',
        `Scanner error: ${scannerEvent.code}`
      );
    }
  }

  try {
    await scannerClient.connect(onScannerEvent);
    await scannerClient.enableScanning();
  } catch (error) {
    workspace.store.setElectricalTestingStatusMessage(
      'scanner',
      resultToString(err(error))
    );
    throw error;
  }

  workspace.store.setElectricalTestingStatusMessage(
    'scanner',
    'Scanning enabled; waiting for paper'
  );

  await scannerClient.ejectAndRescanPaperIfPresent();

  while (!controller.signal.aborted) {
    if (shouldResetScanning) {
      workspace.store.setElectricalTestingStatusMessage(
        'scanner',
        'Resetting scanning'
      );
      await scannerClient.reconnect();
      await scannerClient.enableScanning();
      await scannerClient.ejectAndRescanPaperIfPresent();
      workspace.store.setElectricalTestingStatusMessage(
        'scanner',
        'Scanning enabled; waiting for paper'
      );
      shouldResetScanning = false;
      lastScanTime = undefined;
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

  await scannerClient.disconnect();

  workspace.store.setElectricalTestingStatusMessage(
    'scanner',
    'Scanner disconnected'
  );
}
