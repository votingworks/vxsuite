import { saveSheetImages } from '@votingworks/ballot-interpreter';
import { extractErrorMessage, ok, sleep } from '@votingworks/basics';
import { LogEventId } from '@votingworks/logging';
import { ScannerEvent } from '@votingworks/pdi-scanner';
import { createCanvas, ImageData } from 'canvas';
import { DateTime } from 'luxon';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { inspect } from 'node:util';
import {
  BooleanEnvironmentVariableName,
  isFeatureFlagEnabled,
} from '@votingworks/utils';
import { writeScanPageAnalyses } from '../analysis/scan';
import { type ServerContext } from '../context';
import { resultToString } from '../utils';

export const LOOP_INTERVAL_MS = 100;
export const PRINT_INTERVAL_SECONDS = 5 * 60;
export const DELAY_AFTER_ACCEPT_MS = 2_500;

function createPrinterTestImage(): ImageData {
  const canvas = createCanvas(200, 50);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#000';
  ctx.font = '20px Arial';
  ctx.fillText('Testing printer', 25, 25);

  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

export async function runPrintAndScanTask({
  usbDrive,
  printerTask,
  scannerTask,
  logger,
  printer,
  scannerClient,
  workspace,
}: ServerContext): Promise<void> {
  void printerTask.waitUntilIsStopped().then((reason = 'unknown') => {
    logger.log(LogEventId.BackgroundTaskCancelled, 'system', {
      message: `Printer loop stopping. Reason: ${reason}`,
    });
  });

  void scannerTask.waitUntilIsStopped().then((reason = 'unknown') => {
    logger.log(LogEventId.BackgroundTaskCancelled, 'system', {
      message: `Scanner loop stopping. Reason: ${reason}`,
    });
  });

  const printerTestImage = createPrinterTestImage();
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

      const sheetId = `electrical-testing-${lastScanTime
        .toISO()
        .replaceAll(':', '-')}`;
      await saveSheetImages({
        sheetId,
        ballotImagesPath: workspace.ballotImagesPath,
        images: scannerEvent.images,
      });

      if (
        isFeatureFlagEnabled(
          BooleanEnvironmentVariableName.ENABLE_HARDWARE_TEST_APP_INTERNAL_FUNCTIONS
        )
      ) {
        const usbDriveStatus = await usbDrive.status();
        if (usbDriveStatus.status === 'mounted') {
          const usbDriveExportDirectory = join(
            usbDriveStatus.mountPoint,
            'ballot-images'
          );
          await mkdir(usbDriveExportDirectory, { recursive: true });

          await saveSheetImages({
            sheetId,
            ballotImagesPath: usbDriveExportDirectory,
            images: scannerEvent.images,
          });
          await writeScanPageAnalyses(
            logger,
            lastScanTime,
            [front, back],
            usbDriveExportDirectory,
            sheetId
          );
        }
      }
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

  // eslint-disable-next-line no-constant-condition
  while (true) {
    // Exit the loop if both tasks are stopped.
    if (printerTask.isStopped() && scannerTask.isStopped()) {
      break;
    }

    // Wait for at least one task to be running.
    await Promise.race([
      printerTask.waitUntilIsRunning(),
      scannerTask.waitUntilIsRunning(),
    ]);

    if (printerTask.isRunning()) {
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
            `Printer is in an unexpected state: ${inspect(printerStatus)}`
          );
        } else if (
          !lastPrintTime ||
          DateTime.now().diff(lastPrintTime).as('seconds') >
            PRINT_INTERVAL_SECONDS
        ) {
          workspace.store.setElectricalTestingStatusMessage(
            'printer',
            'Printing…'
          );

          const result =
            (await printer.printImageData(printerTestImage)) ?? ok();

          if (result.isOk()) {
            lastPrintTime = DateTime.now();
          }

          workspace.store.setElectricalTestingStatusMessage(
            'printer',
            resultToString(result)
          );
        }
      } catch (error) {
        workspace.store.setElectricalTestingStatusMessage(
          'printer',
          `Error while printing: ${extractErrorMessage(error)}`
        );
      }
    }

    if (scannerTask.isRunning()) {
      if (shouldResetScanning) {
        workspace.store.setElectricalTestingStatusMessage(
          'scanner',
          'Resetting scanning'
        );

        try {
          if (scannerClient.isConnected()) {
            await scannerClient.disconnect();
          }
          await scannerClient.connect(async (event) => {
            try {
              await onScannerEvent(event);
            } catch (error) {
              workspace.store.setElectricalTestingStatusMessage(
                'scanner',
                `Error during scanner event (${
                  event.event
                }): ${extractErrorMessage(error)}`
              );
            }
          });
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
          DELAY_AFTER_ACCEPT_MS
      ) {
        await scannerClient.ejectAndRescanPaperIfPresent();

        workspace.store.setElectricalTestingStatusMessage(
          'scanner',
          'Ejected document to re-scan'
        );

        lastScanTime = undefined;
      }
    }

    // Wait for the next interval or until both loops are stopped.
    await Promise.race([
      sleep(LOOP_INTERVAL_MS),
      Promise.all([
        printerTask.waitUntilIsStopped(),
        scannerTask.waitUntilIsStopped(),
      ]),
    ]);
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
