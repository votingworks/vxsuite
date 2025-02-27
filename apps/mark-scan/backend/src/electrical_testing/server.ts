import { LogEventId } from '@votingworks/logging';

import { execFile } from '@votingworks/backend';
import { PORT } from '../globals';
import { buildApp } from './app';
import { cardReadLoop, printAndScanLoop } from './background';
import { ServerContext } from './context';

export function startElectricalTestingServer(context: ServerContext): void {
  const { logger } = context;

  setTimeout(() => cardReadLoop(context));
  setTimeout(() => printAndScanLoop(context));

  const app = buildApp(context);

  app.listen(PORT, async () => {
    await execFile('amixer', ['sset', 'Master', `40%`, 'unmute']);
    await logger.log(LogEventId.ApplicationStartup, 'system', {
      disposition: 'success',
      message: `VxMark electrical testing backend running at http://localhost:${PORT}`,
    });
  });
}
