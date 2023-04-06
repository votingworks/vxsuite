import { Server } from 'http';
import {
  constructJavaCardConfig,
  InsertedSmartCardAuth,
  JavaCard,
  MemoryCard,
  MockFileCard,
} from '@votingworks/auth';
import { LogEventId, Logger, LogSource } from '@votingworks/logging';
import {
  BooleanEnvironmentVariableName,
  isFeatureFlagEnabled,
  isIntegrationTest,
} from '@votingworks/utils';

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
  const auth = new InsertedSmartCardAuth({
    card:
      isFeatureFlagEnabled(BooleanEnvironmentVariableName.USE_MOCK_CARDS) ||
      isIntegrationTest()
        ? /* istanbul ignore next */ new MockFileCard()
        : isFeatureFlagEnabled(BooleanEnvironmentVariableName.ENABLE_JAVA_CARDS)
        ? /* istanbul ignore next */ new JavaCard(constructJavaCardConfig())
        : new MemoryCard({ baseUrl: 'http://localhost:3001' }),
    config: {
      allowCardlessVoterSessions: true,
      allowElectionManagersToAccessMachinesConfiguredForOtherElections: true,
    },
    logger,
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
