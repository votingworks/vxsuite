import { join } from 'node:path';
import { promises as fs } from 'node:fs';
import PdfDocument from 'pdfkit';
import { Buffer } from 'node:buffer';

import {
  err,
  ok,
  extractErrorMessage,
  Result,
  sleep,
  assertDefined,
} from '@votingworks/basics';
import {
  getPaperHandlerDriver,
  isPaperInScanner,
  isPaperJammed,
  isPaperReadyToLoad,
} from '@votingworks/custom-paper-handler';
import { LogEventId } from '@votingworks/logging';
import { DateTime } from 'luxon';
import { constructAuthMachineState } from '../util/auth';
import {
  printBallotChunks,
  scanAndSave,
} from '../custom-paper-handler/application_driver';
import { type ElectricalTestingServerContext } from './server';

const CARD_READ_INTERVAL_SECONDS = 5;
const PAPER_HANDLER_POLL_INTERVAL_MS = 250;
const PAPER_LOAD_LOG_INTERVAL_MS = 5000;

const TEST_DOC = {
  DPI: 72,
  WIDTH_IN: 8,
  HEIGHT_IN: 11,
} as const;

function resultToString(result: Result<unknown, unknown>): string {
  return result.isOk()
    ? 'Success'
    : `Error: ${extractErrorMessage(result.err())}`;
}

export async function cardReadLoop({
  auth,
  workspace,
  logger,
  controller,
}: ElectricalTestingServerContext): Promise<void> {
  controller.signal.addEventListener('abort', () => {
    void logger.log(LogEventId.BackgroundTaskCancelled, 'system', {
      message: `Card read loop stopping. Reason: ${controller.signal.reason}`,
    });
  });

  while (!controller.signal.aborted) {
    const machineState = constructAuthMachineState(workspace);
    const cardReadResult = await auth.readCardData(machineState);
    workspace.store.setElectricalTestingStatusMessage(
      'card',
      resultToString(cardReadResult)
    );

    await sleep(CARD_READ_INTERVAL_SECONDS * 1000);
  }
}

function generateTestPdf() {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    const doc = new PdfDocument({
      size: [
        TEST_DOC.WIDTH_IN * TEST_DOC.DPI,
        TEST_DOC.HEIGHT_IN * TEST_DOC.DPI,
      ],
    });

    doc.on('data', (chunk) => chunks.push(chunk));

    doc.on('end', () => {
      const pdfBuffer = Buffer.concat(chunks);
      resolve(pdfBuffer);
    });

    doc.on('error', reject);

    doc
      .fontSize(12)
      .text(
        `${'Sample document '.repeat(3)}${'\n'.repeat(
          40
        )}${'Sample document end '.repeat(3)}`
      )
      .end();
  });
}

export async function printAndScanLoop({
  workspace,
  logger,
  controller,
}: ElectricalTestingServerContext): Promise<void> {
  await logger.log(LogEventId.BackgroundTaskStarted, 'system', {
    message: 'Started print and scan task',
  });

  function setPaperHandlerStatusMessage(message: string) {
    workspace.store.setElectricalTestingStatusMessage('paper-handler', message);
  }

  controller.signal.addEventListener('abort', () => {
    const message = `Print and scan loop stopping. Reason: ${controller.signal.reason}`;
    void logger.log(LogEventId.BackgroundTaskCancelled, 'system', {
      message,
    });

    setPaperHandlerStatusMessage(message);
  });

  const testPdf = await generateTestPdf();
  const outputDir = join(workspace.path, 'electrical-testing-output');
  await fs.mkdir(outputDir, { recursive: true });

  await fs.writeFile(
    join(outputDir, 'test-document.pdf'),
    new Uint8Array(testPdf.buffer, testPdf.byteOffset, testPdf.byteLength)
  );

  const driver = await getPaperHandlerDriver();
  if (driver === undefined) {
    setPaperHandlerStatusMessage('Could not connect to paper handler');

    return;
  }

  /**
   * Checks paper handler status for jam state.
   * If detected, saves a status message and returns a Result<Error>.
   */
  async function errorIfPaperJam(): Promise<Result<void, Error>> {
    const currentStatus = await assertDefined(driver).getPaperHandlerStatus();

    if (isPaperJammed(currentStatus)) {
      await logger.log(LogEventId.BackgroundTaskFailure, 'system', {
        message: 'Print and scan loop failed with paper jam.',
      });

      const message =
        'Printer is jammed. Please remove the paper and restart the machine.';
      setPaperHandlerStatusMessage(message);
      return err(new Error(message));
    }

    return ok();
  }

  await logger.log(LogEventId.BackgroundTaskStatus, 'system', {
    message: 'Initializing printer',
  });
  await driver.initializePrinter();
  await driver.setLineSpacing(0);
  await driver.setPrintingSpeed('slow');

  let status = await driver.getPaperHandlerStatus();

  if ((await errorIfPaperJam()).isErr()) {
    return;
  }

  // Wait for user to put paper in input
  // Subtract log duration so we immediately get a log
  let logStart = DateTime.now().minus(PAPER_LOAD_LOG_INTERVAL_MS);
  while (!isPaperReadyToLoad(status)) {
    if (
      DateTime.now().diff(logStart).as('milliseconds') >=
      PAPER_LOAD_LOG_INTERVAL_MS
    ) {
      await logger.log(LogEventId.BackgroundTaskStatus, 'system', {
        message: 'Waiting for paper load.',
      });
      logStart = DateTime.now();
    }

    await sleep(PAPER_HANDLER_POLL_INTERVAL_MS);
    status = await driver.getPaperHandlerStatus();
    if ((await errorIfPaperJam()).isErr()) {
      return;
    }
  }

  // Once paper is detected in input, grasp paper and move to inside the device
  await logger.log(LogEventId.BackgroundTaskStatus, 'system', {
    message: 'Loading paper',
  });
  await driver.loadPaper();
  if ((await errorIfPaperJam()).isErr()) {
    return;
  }

  await logger.log(LogEventId.BackgroundTaskStatus, 'system', {
    message: 'Parking paper',
  });
  await driver.parkPaper();
  if ((await errorIfPaperJam()).isErr()) {
    return;
  }

  status = await driver.getPaperHandlerStatus();
  if (!isPaperInScanner(status)) {
    setPaperHandlerStatusMessage(
      'Could not detect paper in scanner after loading'
    );
    return;
  }

  await logger.log(LogEventId.BackgroundTaskStatus, 'system', {
    message: 'Beginning print and scan loop',
  });
  let i = 0;
  while (!controller.signal.aborted) {
    // printBallotChunks will enable print mode.
    await logger.log(LogEventId.BackgroundTaskStatus, 'system', {
      message: `Printing ${testPdf.length} bytes`,
    });
    await printBallotChunks(driver, testPdf, {});
    // Disable print mode to prepare to scan.
    await driver.disablePrint();
    if ((await errorIfPaperJam()).isErr()) {
      return;
    }

    const outputPath = join(
      outputDir,
      `scan-${new Date().toISOString().replace(/:/g, '-')}.jpeg`
    );
    await logger.log(LogEventId.BackgroundTaskStatus, 'system', {
      message: 'Scanning and saving',
    });
    await scanAndSave(driver, 'backward', outputPath);
    if ((await errorIfPaperJam()).isErr()) {
      return;
    }

    await logger.log(LogEventId.BackgroundTaskStatus, 'system', {
      message: 'Presenting paper',
    });
    await driver.presentPaper();
    if ((await errorIfPaperJam()).isErr()) {
      return;
    }

    await logger.log(LogEventId.BackgroundTaskStatus, 'system', {
      message: 'Parking paper',
    });
    await driver.parkPaper();
    if ((await errorIfPaperJam()).isErr()) {
      return;
    }

    i += 1;

    const message = `Print and scan loop has completed ${i} times`;
    await logger.log(LogEventId.BackgroundTaskStatus, 'system', { message });
    setPaperHandlerStatusMessage(message);
  }
}
