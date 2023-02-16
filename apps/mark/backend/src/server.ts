import { Server } from 'http';
import { InsertedSmartCardAuthWithMemoryCard } from '@votingworks/auth';
import { LogEventId, Logger, LogSource } from '@votingworks/logging';
import { WebServiceCard } from '@votingworks/utils';

import { buildApp } from './app';
import { PORT } from './globals';

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
  const auth = new InsertedSmartCardAuthWithMemoryCard({
    card: new WebServiceCard({ baseUrl: 'http://localhost:3001' }),
    config: {
      allowedUserRoles: [
        'system_administrator',
        'election_manager',
        'poll_worker',
        'cardless_voter',
      ],
      allowElectionManagersToAccessMachinesConfiguredForOtherElections: true,
    },
  });
  const app = buildApp(auth);

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
