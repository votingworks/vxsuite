import {
  findTimingMarkGrid,
  saveSheetImages,
} from '@votingworks/ballot-interpreter';
import {
  extractErrorMessage,
  ok,
  sleep,
  throwIllegalValue,
} from '@votingworks/basics';
import { LogEventId } from '@votingworks/logging';
import { ScannerEvent } from '@votingworks/pdi-scanner';
import { mapSheet } from '@votingworks/types';
import { createCanvas, ImageData } from 'canvas';
import { DateTime } from 'luxon';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { inspect } from 'node:util';
import {
  BooleanEnvironmentVariableName,
  isFeatureFlagEnabled,
} from '@votingworks/utils';
import { analyzeScannedPage, writeScanPageAnalyses } from '../analysis/scan';
import type { ScanningMode, ServerContext } from '../context';
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
  setStatusMessage,
  onScanningSessionChanged,
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
  let lastMode: ScanningMode | undefined;
  let shouldResetScanning = true;

  async function onScannerEvent(scannerEvent: ScannerEvent) {
    setStatusMessage('scanner', `Received event: ${scannerEvent.event}`);

    if (scannerEvent.event === 'scanComplete') {
      const { session } = scannerTask.getState();
      lastScanTime = DateTime.now();

      const [front, back] = scannerEvent.images;
      setStatusMessage(
        'scanner',
        `Scanned sheet: front=${front.width}×${front.height}, back=${back.width}×${back.height}`
      );

      const sheetId = `electrical-testing-${lastScanTime
        .toISO()
        .replaceAll(':', '-')}`;
      const savedImagePaths = await saveSheetImages({
        sheetId,
        ballotImagesPath: workspace.ballotImagesPath,
        images: scannerEvent.images,
      });

      const analyses = mapSheet([front, back], (image) =>
        analyzeScannedPage(findTimingMarkGrid(image))
      );

      session.addSheetAnalysis(
        mapSheet(savedImagePaths, analyses, (path, analysis) => ({
          path,
          analysis,
        }))
      );
      onScanningSessionChanged();

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
            analyses,
            usbDriveExportDirectory,
            sheetId
          );
        }
      }
    }

    if (scannerEvent.event === 'error') {
      lastScanTime = undefined;
      shouldResetScanning = true;
      setStatusMessage('scanner', `Scanner error: ${scannerEvent.code}`);
    }
  }

  async function ejectPaper() {
    const { mode } = scannerTask.getState();
    switch (mode) {
      case 'shoe-shine':
        await scannerClient.ejectAndRescanPaperIfPresent();
        await scannerClient.enableScanning();
        break;
      case 'manual-front':
        await scannerClient.ejectPaper('toFront');
        await scannerClient.enableScanning();
        break;
      case 'manual-rear':
        await scannerClient.ejectPaper('toRear');
        await scannerClient.enableScanning();
        break;
      case 'disabled':
        await scannerClient.disableScanning();
        break;
      default:
        throwIllegalValue(mode);
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
        const { lastPrintedAt } = printerTask.getState();

        if (
          printerStatus.scheme === 'hardware-v4' &&
          printerStatus.state !== 'idle'
        ) {
          setStatusMessage(
            'printer',
            `Printer is in an unexpected state: ${inspect(printerStatus)}`
          );
        } else if (
          !lastPrintedAt ||
          DateTime.now().diff(lastPrintedAt).as('seconds') >
            PRINT_INTERVAL_SECONDS
        ) {
          setStatusMessage('printer', 'Printing…');

          const result =
            (await printer.printImageData(printerTestImage)) ?? ok();

          if (result.isOk()) {
            printerTask.setState({ lastPrintedAt: DateTime.now() });
          }

          setStatusMessage('printer', resultToString(result));
        }
      } catch (error) {
        setStatusMessage(
          'printer',
          `Error while printing: ${extractErrorMessage(error)}`
        );
      }
    }

    if (scannerTask.isRunning()) {
      const { mode } = scannerTask.getState();

      if (mode !== lastMode) {
        lastMode = mode;
        shouldResetScanning = true;
      }

      if (shouldResetScanning) {
        setStatusMessage('scanner', 'Resetting scanning');

        try {
          if (scannerClient.isConnected()) {
            await scannerClient.disconnect();
          }
          await scannerClient.connect(async (event) => {
            try {
              await onScannerEvent(event);
            } catch (error) {
              setStatusMessage(
                'scanner',
                `Error during scanner event (${
                  event.event
                }): ${extractErrorMessage(error)}`
              );
            }
          });
          await ejectPaper();

          if (mode === 'disabled') {
            setStatusMessage('scanner', 'Scanning disabled');
          } else {
            setStatusMessage('scanner', 'Scanning enabled; waiting for paper');
          }
          shouldResetScanning = false;
        } catch (error) {
          setStatusMessage(
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
        if (mode !== 'disabled') {
          await ejectPaper();

          switch (mode) {
            case 'shoe-shine':
              setStatusMessage('scanner', 'Ejected document to re-scan');
              break;

            case 'manual-front':
              setStatusMessage('scanner', 'Ejected document to front');
              break;

            case 'manual-rear':
              setStatusMessage('scanner', 'Ejected document to rear');
              break;

            default:
              throwIllegalValue(mode);
          }
        }

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

  setStatusMessage('scanner', 'Print and scan loop stopping');

  if (scannerClient.isConnected()) {
    await scannerClient.disconnect();
  }

  setStatusMessage('scanner', 'Scanner disconnected');
}
