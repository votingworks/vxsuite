/* istanbul ignore file - @preserve */
import { LogEventId } from '@votingworks/logging';

import { PORT } from '../globals';
import { buildApp } from './app';
import { runCardReadAndUsbDriveWriteTask } from './background';
import { ServerContext } from './context';

export function startElectricalTestingServer(context: ServerContext): void {
  const { logger } = context;

  setTimeout(() => runCardReadAndUsbDriveWriteTask(context));

  const app = buildApp(context);

  app.listen(PORT, () => {
    logger.log(LogEventId.ApplicationStartup, 'system', {
      disposition: 'success',
      message: `VxMark electrical testing backend running at http://localhost:${PORT}`,
    });
  });
}
