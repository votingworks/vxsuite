import { Logger, LogEventId, LogSource } from '@votingworks/logging';
import { Server } from 'http';
import { PORT } from './globals';
import { buildApp } from './app';

export interface StartOptions {
  port: number | string;
  logger: Logger;
}

/**
 * Starts the server with all the default options.
 */
export function start({
  port = PORT,
  logger = new Logger(LogSource.VxMarkBackend),
}: Partial<StartOptions> = {}): Server {
  const app = buildApp();

  return app.listen(
    port,
    /* istanbul ignore next */
    async () => {
      await logger.log(LogEventId.ApplicationStartup, 'system', {
        message: `VxMark backend running at http://localhost:${port}/`,
        disposition: 'success',
      });
    }
  );
}
