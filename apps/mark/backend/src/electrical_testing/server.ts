import { LogEventId } from '@votingworks/logging';

import { cleanupCachedBrowser } from '@votingworks/printing';
import { extractErrorMessage } from '@votingworks/basics';
import { PORT } from '../globals.js';
import { buildApp } from './app.js';
import {
  runCardReadAndUsbDriveWriteTask,
  runPrinterTestTask,
} from './background.js';
import { ServerContext } from './context.js';
import { initializeAudio } from '../audio/initialize.js';

export function startElectricalTestingServer(context: ServerContext): void {
  const { logger, barcodeClient } = context;

  setTimeout(() => runCardReadAndUsbDriveWriteTask(context));
  setTimeout(() => runPrinterTestTask(context));

  const app = buildApp(context);

  const server = app.listen(PORT, async () => {
    try {
      // System volume is set to 100% in the prod app, but the HWTA has no UI volume control, so we
      // set to a safe listening level discovered the hard way
      await initializeAudio(logger, { defaultVolumeOverride: 40 });
    } catch (error) {
      logger.log(LogEventId.ApplicationStartup, 'system', {
        disposition: 'failure',
        message: `Failed to initialize audio: ${extractErrorMessage(error)}`,
      });
    }

    logger.log(LogEventId.ApplicationStartup, 'system', {
      disposition: 'success',
      message: `VxMark electrical testing backend running at http://localhost:${PORT}`,
    });
  });

  async function cleanup(): Promise<void> {
    logger.log(LogEventId.ApplicationStartup, 'system', {
      message: 'Shutting down VxMark electrical testing backend',
    });
    if (barcodeClient) {
      await barcodeClient.shutDown();
    }
    await cleanupCachedBrowser();
    server.close();
  }

  process.on('SIGINT', () => {
    void cleanup().then(() => process.exit(0));
  });

  process.on('SIGTERM', () => {
    void cleanup().then(() => process.exit(0));
  });
}
