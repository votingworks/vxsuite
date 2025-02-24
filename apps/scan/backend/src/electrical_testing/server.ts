import { LogEventId } from '@votingworks/logging';

import { PORT } from '../globals';
import { buildApp } from './app';
import { cardReadAndUsbDriveWriteLoop, printAndScanLoop } from './background';
import { ServerContext } from './context';

export function startElectricalTestingServer(context: ServerContext): void {
  const { logger } = context;

  setTimeout(() => cardReadAndUsbDriveWriteLoop(context));
  setTimeout(() => printAndScanLoop());

  const app = buildApp(context);

  app.listen(PORT, async () => {
    await logger.log(LogEventId.ApplicationStartup, 'system', {
      disposition: 'success',
      message: `VxScan electrical testing backend running at http://localhost:${PORT}`,
    });
  });
}
