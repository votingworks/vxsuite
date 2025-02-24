import { LogEventId } from '@votingworks/logging';

import { PORT } from '../globals';
import { buildApp } from './app';
import { cardReadLoop, printAndScanLoop } from './background';
import { ServerContext } from './context';

export interface ElectricalTestingServerContext extends ServerContext {
  controller: AbortController;
}

export function startElectricalTestingServer(context: ServerContext): void {
  const { logger } = context;
  const controller = new AbortController();

  const testContext: ElectricalTestingServerContext = {
    ...context,
    controller,
  };

  setTimeout(() => cardReadLoop(testContext));
  setTimeout(() => printAndScanLoop(testContext));

  const app = buildApp(testContext);

  app.listen(PORT, async () => {
    await logger.log(LogEventId.ApplicationStartup, 'system', {
      disposition: 'success',
      message: `VxMark electrical testing backend running at http://localhost:${PORT}`,
    });
  });
}
