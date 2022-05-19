import { LogEventId, Logger, LogSource } from '@votingworks/logging';
import express, { Application } from 'express';
import { PORT } from './globals';

type NoParams = never;

/**
 * Builds an express application.
 */
export function buildApp(): Application {
  const app: Application = express();

  app.use(express.raw());
  app.use(express.json({ limit: '5mb', type: 'application/json' }));
  app.use(express.urlencoded({ extended: false }));

  app.get<NoParams>('/', (_, response) => {
    response.send('Hello world');
  });

  return app;
}

export interface StartOptions {
  app: Application;
  logger: Logger;
  port: number | string;
}

/**
 * Starts the server with all the default options.
 */
// eslint-disable-next-line @typescript-eslint/require-await
export async function start({
  app,
  logger = new Logger(LogSource.VxScanService),
  port = PORT,
}: Partial<StartOptions>): Promise<void> {
  /* istanbul ignore next */
  const resolvedApp = app ?? buildApp();

  resolvedApp.listen(port, async () => {
    await logger.log(LogEventId.ApplicationStartup, 'system', {
      message: `Admin Service running at http://localhost:${port}/`,
      disposition: 'success',
    });
  });
}
