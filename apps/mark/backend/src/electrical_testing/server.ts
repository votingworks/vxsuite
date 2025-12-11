import { LogEventId } from '@votingworks/logging';

import { cleanupCachedBrowser } from '@votingworks/printing';
import { PORT } from '../globals';
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

  const server = app.listen(PORT, () => {
    logger.log(LogEventId.ApplicationStartup, 'system', {
      disposition: 'success',
      message: `VxMark electrical testing backend running at http://localhost:${PORT}`,
    });
  });

  async function cleanup(): Promise<void> {
    logger.log(LogEventId.ApplicationStartup, 'system', {
      message: 'Shutting down VxMark electrical testing backend',
    });
    await barcodeClient?.shutDown();
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
