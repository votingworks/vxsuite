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
import { mapSheet, SheetOf } from '@votingworks/types';
import { createCanvas, ImageData } from 'canvas';
import { DateTime } from 'luxon';
import { mkdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { inspect } from 'node:util';
import {
  BooleanEnvironmentVariableName,
  isFeatureFlagEnabled,
} from '@votingworks/utils';
import {
  analyzeScannedPage,
  ScannedPageAnalysis,
  writeScanPageAnalyses,
} from '../analysis/scan';
import type { ScanningMode, ServerContext } from '../context';
import { resultToString } from '../utils';

export const LOOP_INTERVAL_MS = 100;
export const PRINT_INTERVAL_SECONDS = 5 * 60;
export const DELAY_AFTER_ACCEPT_MS = 2_500;
export const DELAY_AFTER_SCANNER_ERROR_MS = 5_000;

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
  let lastScannerErrorTime: DateTime | undefined;
  let lastMode: ScanningMode | undefined;
  let shouldResetScanning = true;
  let isProcessingScannerEvent = false;

  async function onScannerEvent(scannerEvent: ScannerEvent) {
    isProcessingScannerEvent = true;
    try {
      await onScannerEventInner(scannerEvent);
    } finally {
      isProcessingScannerEvent = false;
    }
  }

  async function onScannerEventInner(scannerEvent: ScannerEvent) {
    workspace.store.setElectricalTestingStatusMessage(
      'scanner',
      `Received event: ${scannerEvent.event}`
    );

    if (scannerEvent.event === 'scanComplete') {
      const { session } = scannerTask.getState();
      lastScanTime = DateTime.now();

      const [front, back] = scannerEvent.images;
      workspace.store.setElectricalTestingStatusMessage(
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

      let analyses: SheetOf<ScannedPageAnalysis> | undefined;
      try {
        analyses = await mapSheet([front, back], async (image) =>
          analyzeScannedPage(await findTimingMarkGrid(image))
        );
      } catch (error) {
        // Analysis can fail (e.g. MissingTimingMarks), and we still want to
        // store the images in the session so they show up in the frontend.
        workspace.store.setElectricalTestingStatusMessage(
          'scanner',
          `Failed to detect timing mark grid: ${extractErrorMessage(error)}`
        );
      }

      const droppedSheet = session.addSheetAnalysis(
        mapSheet(savedImagePaths, (path, _side, index) => ({
          path,
          analysis: analyses?.[index],
        }))
      );

      if (droppedSheet) {
        for (const { path } of droppedSheet) {
          // Delete from disk, too, to avoid running out of disk space
          try {
            await unlink(path);
          } catch (error) {
            logger.log(LogEventId.ClearedBallotData, 'system', {
              disposition: 'failure',
              message: `Failed to delete image at path ${path}: ${extractErrorMessage(
                error
              )}`,
            });
          }
        }
      }

      if (
        analyses &&
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
      workspace.store.setElectricalTestingStatusMessage(
        'scanner',
        `Scanner error: ${scannerEvent.code}`
      );
    }
  }

  async function ejectPaper(): Promise<boolean> {
    const { mode } = scannerTask.getState();
    switch (mode) {
      case 'shoe-shine': {
        const ejected = await scannerClient.ejectAndRescanPaperIfPresent();
        await scannerClient.enableScanning();
        return ejected;
      }
      case 'manual-front': {
        const ejected = await scannerClient.ejectPaper('toFront');
        await scannerClient.enableScanning();
        return ejected;
      }
      case 'manual-rear': {
        const ejected = await scannerClient.ejectPaper('toRear');
        await scannerClient.enableScanning();
        return ejected;
      }
      case 'disabled':
        await scannerClient.disableScanning();
        return false;
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

        if (printerStatus.state !== 'idle') {
          workspace.store.setElectricalTestingStatusMessage(
            'printer',
            `Printer is in an unexpected state: ${inspect(printerStatus)}`
          );
        } else if (
          !lastPrintedAt ||
          DateTime.now().diff(lastPrintedAt).as('seconds') >
            PRINT_INTERVAL_SECONDS
        ) {
          workspace.store.setElectricalTestingStatusMessage(
            'printer',
            'Printing…'
          );

          const result =
            (await printer.printImageData(printerTestImage)) ?? ok();

          if (result.isOk()) {
            printerTask.setState({ lastPrintedAt: DateTime.now() });
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
      const { mode } = scannerTask.getState();

      if (mode !== lastMode) {
        lastMode = mode;
        shouldResetScanning = true;
      }

      const scannerErrorCoolDownComplete =
        !lastScannerErrorTime ||
        DateTime.now().diff(lastScannerErrorTime).as('milliseconds') >
          DELAY_AFTER_SCANNER_ERROR_MS;

      if (shouldResetScanning && scannerErrorCoolDownComplete) {
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
          await ejectPaper();

          if (mode === 'disabled') {
            workspace.store.setElectricalTestingStatusMessage(
              'scanner',
              'Scanning disabled'
            );
          } else {
            workspace.store.setElectricalTestingStatusMessage(
              'scanner',
              'Scanning enabled; waiting for paper'
            );
          }
          shouldResetScanning = false;
          lastScannerErrorTime = undefined;
        } catch (error) {
          workspace.store.setElectricalTestingStatusMessage(
            'scanner',
            `Error while resetting scanning: ${extractErrorMessage(error)}`
          );
          lastScannerErrorTime = DateTime.now();
        }
      }

      if (
        lastScanTime &&
        !isProcessingScannerEvent &&
        DateTime.now().diff(lastScanTime).as('milliseconds') >
          DELAY_AFTER_ACCEPT_MS
      ) {
        if (mode !== 'disabled') {
          try {
            const paperWasPresent = await ejectPaper();

            if (!paperWasPresent) {
              const frontSensorCovered =
                await scannerClient.isFrontSensorCovered();
              if (frontSensorCovered) {
                // Paper is at the front but not the rear — a
                // disconnect/reconnect cycle will re-initialize the feeder
                // so it detects and pulls the paper back through.
                workspace.store.setElectricalTestingStatusMessage(
                  'scanner',
                  'Paper detected at front but not rear; resetting to re-feed'
                );
                shouldResetScanning = true;
              } else {
                workspace.store.setElectricalTestingStatusMessage(
                  'scanner',
                  'No paper detected on sensors; waiting for paper'
                );
              }
            } else {
              switch (mode) {
                case 'shoe-shine':
                  workspace.store.setElectricalTestingStatusMessage(
                    'scanner',
                    'Ejected document to re-scan'
                  );
                  break;

                case 'manual-front':
                  workspace.store.setElectricalTestingStatusMessage(
                    'scanner',
                    'Ejected document to front'
                  );
                  break;

                case 'manual-rear':
                  workspace.store.setElectricalTestingStatusMessage(
                    'scanner',
                    'Ejected document to rear'
                  );
                  break;

                default:
                  throwIllegalValue(mode);
              }
            }
          } catch (error) {
            workspace.store.setElectricalTestingStatusMessage(
              'scanner',
              `Error while ejecting paper: ${extractErrorMessage(error)}`
            );
            shouldResetScanning = true;
            lastScannerErrorTime = DateTime.now();
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
