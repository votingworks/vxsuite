import { Logger, LogEventId, LogSource } from '@votingworks/logging';
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
}: Partial<StartOptions> = {}): void {
  const app = buildApp();

  app.listen(port, async () => {
    await logger.log(LogEventId.ApplicationStartup, 'system', {
      message: `VxMark backend running at http://localhost:${port}/`,
      disposition: 'success',
    });
  });
}
