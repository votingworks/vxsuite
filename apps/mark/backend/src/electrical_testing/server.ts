import { LogEventId } from '@votingworks/logging';

import {
  AUDIO_DEVICE_DEFAULT_SINK,
  setAudioVolume,
} from '@votingworks/backend';
import { cleanupCachedBrowser } from '@votingworks/printing';
import { NODE_ENV, PORT } from '../globals';
import { buildApp } from './app';
import {
  runCardReadAndUsbDriveWriteTask,
  runPrinterTestTask,
} from './background';
import { ServerContext } from './context';

export function startElectricalTestingServer(context: ServerContext): void {
  const { logger, barcodeClient } = context;

  setTimeout(() => runCardReadAndUsbDriveWriteTask(context));
  setTimeout(() => runPrinterTestTask(context));

  const app = buildApp(context);

  const server = app.listen(PORT, async () => {
    const volumeResult = await setAudioVolume({
      logger,
      nodeEnv: NODE_ENV,
      sinkName: AUDIO_DEVICE_DEFAULT_SINK,
      volumePct: 40,
    });
    if (volumeResult.isErr()) {
      logger.log(LogEventId.Info, 'system', {
        message: `Failed to set initial audio volume: ${volumeResult.err()}`,
        disposition: 'failure',
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
