import { Server } from 'http';
import {
  InsertedSmartCardAuth,
  InsertedSmartCardAuthApi,
  MockFileVxSuiteCard,
  VxSuiteJavaCard,
} from '@votingworks/auth';
import { LogEventId, Logger } from '@votingworks/logging';
import {
  BooleanEnvironmentVariableName,
  isFeatureFlagEnabled,
  isIntegrationTest,
} from '@votingworks/utils';
import { detectUsbDrive, MockFileUsbDrive } from '@votingworks/usb-drive';
import { buildApp } from './app';
import { Workspace } from './util/workspace';

export interface StartOptions {
  auth?: InsertedSmartCardAuthApi;
  logger: Logger;
  port: number | string;
  workspace: Workspace;
}

/**
 * Starts the server with all the default options.
 */
export function start({ auth, logger, port, workspace }: StartOptions): Server {
  /* istanbul ignore next */
  const resolvedAuth =
    auth ??
    new InsertedSmartCardAuth({
      card:
        isFeatureFlagEnabled(BooleanEnvironmentVariableName.USE_MOCK_CARDS) ||
        isIntegrationTest()
          ? new MockFileVxSuiteCard()
          : new VxSuiteJavaCard(),
      config: {
        allowCardlessVoterSessions: true,
        allowElectionManagersToAccessMachinesConfiguredForOtherElections: true,
      },
      logger,
    });

  /* istanbul ignore next */
  const usbDrive = isIntegrationTest()
    ? new MockFileUsbDrive()
    : detectUsbDrive(logger);

  const app = buildApp(resolvedAuth, logger, workspace, usbDrive);

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
