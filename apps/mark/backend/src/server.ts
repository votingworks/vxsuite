import { Server } from 'http';
import {
  constructJavaCardConfig,
  InsertedSmartCardAuth,
  JavaCard,
  MemoryCard,
  MockFileCard,
} from '@votingworks/auth';
import { LogEventId, Logger } from '@votingworks/logging';
import {
  BooleanEnvironmentVariableName,
  isFeatureFlagEnabled,
  isIntegrationTest,
} from '@votingworks/utils';

import { getUsbDrives, Usb } from '@votingworks/backend';
import { buildApp } from './app';
import { Workspace } from './util/workspace';

export interface StartOptions {
  port: number | string;
  logger: Logger;
  workspace: Workspace;
}

/**
 * Starts the server with all the default options.
 */
export function start({ port, logger, workspace }: StartOptions): Server {
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

  const usb: Usb = { getUsbDrives };
  const app = buildApp(auth, logger, workspace, usb);

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
