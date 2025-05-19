import { LogEventId } from '@votingworks/logging';

import { execFile } from '@votingworks/backend';
import { PORT } from '../globals';
import { buildApp } from './app';
import {
  runCardReadAndUsbDriveWriteTask,
  runPrintAndScanTask,
} from './background';
import { ServerContext } from './context';

export function startElectricalTestingServer(context: ServerContext): void {
  const { logger } = context;

  setTimeout(() => runCardReadAndUsbDriveWriteTask(context));
  setTimeout(() => runPrintAndScanTask(context));

  const app = buildApp(context);

  app.listen(PORT, async () => {
    await execFile('amixer', ['sset', 'Master', `40%`, 'unmute']);
    logger.log(LogEventId.ApplicationStartup, 'system', {
      disposition: 'success',
      message: `VxMark electrical testing backend running at http://localhost:${PORT}`,
    });
  });
}
