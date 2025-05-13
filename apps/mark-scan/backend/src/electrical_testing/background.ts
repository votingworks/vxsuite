import { join } from 'node:path';
import { promises as fs } from 'node:fs';

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
import { LogEventId, Logger } from '@votingworks/logging';
import { DateTime } from 'luxon';
import { constructAuthMachineState } from '../util/auth';
import {
  printBallotChunks,
  scanAndSave,
} from '../custom-paper-handler/application_driver';
import { ServerContext } from './context';
import { AudioOutput, setAudioOutput } from '../audio/outputs';

const CARD_READ_INTERVAL_SECONDS = 5;
const PAPER_HANDLER_POLL_INTERVAL_MS = 250;
const PAPER_LOAD_LOG_INTERVAL_MS = 5000;
const HEADPHONE_OUTPUT_DURATION_SECONDS = 50;
const SPEAKER_OUTPUT_DURATION_SECONDS = 10;

function resultToString(result: Result<unknown, unknown>): string {
  return result.isOk()
    ? 'Success'
    : `Error: ${extractErrorMessage(result.err())}`;
}

export async function cardReadLoop({
  auth,
  cardTask,
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

  while (!cardTask.isStopped()) {
    await cardTask.waitUntilIsRunning();
    const machineState = constructAuthMachineState(workspace);
    const cardReadResult = await auth.readCardData(machineState);
    workspace.store.setElectricalTestingStatusMessage(
      'card',
      resultToString(cardReadResult)
    );

    await Promise.race([
      sleep(CARD_READ_INTERVAL_SECONDS * 1000),
      cardTask.waitUntilIsStopped(),
    ]);
  }
}

export async function printAndScanLoop({
  paperHandlerTask,
  logger: baseLogger,
  workspace,
}: ServerContext): Promise<void> {
  const logger = Logger.from(baseLogger, () => Promise.resolve('system'));
  await logger.logAsCurrentRole(LogEventId.BackgroundTaskStarted, {
    message: 'Started print and scan task',
  });

  function setPaperHandlerStatusMessage(message: string) {
    workspace.store.setElectricalTestingStatusMessage('paper-handler', message);
  }

  void paperHandlerTask.waitUntilIsStopped().then((reason) => {
    const message = `Print and scan loop stopping. Reason: ${reason}`;
    void logger.logAsCurrentRole(LogEventId.BackgroundTaskCancelled, {
      message,
    });

    setPaperHandlerStatusMessage(message);
  });

  const testPdf = await fs.readFile(
    join(__dirname, '../../electrical-testing-print-page.pdf')
  );
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
      await logger.logAsCurrentRole(LogEventId.BackgroundTaskFailure, {
        message: 'Print and scan loop failed with paper jam.',
      });

      const message =
        'Printer is jammed. Please remove the paper and restart the machine.';
      setPaperHandlerStatusMessage(message);
      return err(new Error(message));
    }

    return ok();
  }

  await logger.logAsCurrentRole(LogEventId.BackgroundTaskStatus, {
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
      await logger.logAsCurrentRole(LogEventId.BackgroundTaskStatus, {
        message: 'Waiting for paper load',
      });
      setPaperHandlerStatusMessage(
        'Please load a sheet of 8x11" thermal paper'
      );
      logStart = DateTime.now();
    }

    await sleep(PAPER_HANDLER_POLL_INTERVAL_MS);
    status = await driver.getPaperHandlerStatus();
    if ((await errorIfPaperJam()).isErr()) {
      return;
    }
  }

  setPaperHandlerStatusMessage('Loading paper');
  // Once paper is detected in input, grasp paper and move to inside the device
  await logger.logAsCurrentRole(LogEventId.BackgroundTaskStatus, {
    message: 'Loading paper',
  });
  await driver.loadPaper();
  if ((await errorIfPaperJam()).isErr()) {
    return;
  }

  await logger.logAsCurrentRole(LogEventId.BackgroundTaskStatus, {
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

  const startMessage = 'Beginning print and scan loop';
  setPaperHandlerStatusMessage(startMessage);
  await logger.logAsCurrentRole(LogEventId.BackgroundTaskStatus, {
    message: startMessage,
  });
  let i = 0;

  let currentAudioOutput = AudioOutput.HEADPHONES;
  let audioOutputDuration = HEADPHONE_OUTPUT_DURATION_SECONDS;
  let audioOutputStart = DateTime.now();

  while (!paperHandlerTask.isStopped()) {
    await paperHandlerTask.waitUntilIsRunning();
    if (
      DateTime.now().diff(audioOutputStart).as('seconds') > audioOutputDuration
    ) {
      audioOutputStart = DateTime.now();

      if (currentAudioOutput === AudioOutput.HEADPHONES) {
        await logger.logAsCurrentRole(LogEventId.BackgroundTaskStatus, {
          message: 'Switching audio output to speaker',
        });
        currentAudioOutput = AudioOutput.SPEAKER;
        audioOutputDuration = SPEAKER_OUTPUT_DURATION_SECONDS;
      } else {
        await logger.logAsCurrentRole(LogEventId.BackgroundTaskStatus, {
          message: 'Switching audio output to headphones',
        });
        currentAudioOutput = AudioOutput.HEADPHONES;
        audioOutputDuration = HEADPHONE_OUTPUT_DURATION_SECONDS;
      }

      await setAudioOutput(currentAudioOutput, logger);
    }

    // printBallotChunks will enable print mode.
    await logger.logAsCurrentRole(LogEventId.BackgroundTaskStatus, {
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
    await logger.logAsCurrentRole(LogEventId.BackgroundTaskStatus, {
      message: 'Scanning and saving',
    });
    await scanAndSave(driver, 'backward', outputPath);
    if ((await errorIfPaperJam()).isErr()) {
      return;
    }

    await logger.logAsCurrentRole(LogEventId.BackgroundTaskStatus, {
      message: 'Presenting paper',
    });
    await driver.presentPaper();
    if ((await errorIfPaperJam()).isErr()) {
      return;
    }

    await logger.logAsCurrentRole(LogEventId.BackgroundTaskStatus, {
      message: 'Parking paper',
    });
    await driver.parkPaper();
    if ((await errorIfPaperJam()).isErr()) {
      return;
    }

    i += 1;

    const message = `Print and scan loop has completed ${i} times`;
    await logger.logAsCurrentRole(LogEventId.BackgroundTaskStatus, {
      message,
    });
    setPaperHandlerStatusMessage(message);
  }
}
