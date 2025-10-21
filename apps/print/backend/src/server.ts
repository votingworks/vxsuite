import { BaseLogger, Logger } from '@votingworks/logging';
import {
  DippedSmartCardAuth,
  DippedSmartCardAuthApi,
  JavaCard,
  MockFileCard,
} from '@votingworks/auth';
import {
  BooleanEnvironmentVariableName,
  isFeatureFlagEnabled,
  isIntegrationTest,
} from '@votingworks/utils';
import { detectUsbDrive } from '@votingworks/usb-drive';
import { buildApp } from './app';
import { PORT } from './globals';
import { Workspace } from './util/workspace';
import { getUserRole } from './util/auth';
import { AppContext } from './context';

export interface StartOptions {
  auth?: DippedSmartCardAuthApi;
  baseLogger: BaseLogger;
  workspace: Workspace;
}

/**
 * Starts the server.
 */
export function start({ auth, baseLogger, workspace }: StartOptions): void {
  const resolvedAuth =
    auth ??
    new DippedSmartCardAuth({
      card:
        isFeatureFlagEnabled(BooleanEnvironmentVariableName.USE_MOCK_CARDS) ||
        isIntegrationTest()
          ? new MockFileCard()
          : new JavaCard(),
      config: {
        allowElectionManagersToAccessUnconfiguredMachines: true,
        allowedUserRoles: [
          'vendor',
          'system_administrator',
          'election_manager',
          'poll_worker',
        ],
      },
      logger: baseLogger,
    });

  const logger = Logger.from(
    baseLogger,
    /* istanbul ignore next - @preserve */ () =>
      getUserRole(resolvedAuth, workspace)
  );
  const usbDrive = detectUsbDrive(logger);

  const context: AppContext = {
    auth: resolvedAuth,
    logger,
    usbDrive,
    workspace,
  };
  const app = buildApp(context);

  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`VxPrint backend running at http://localhost:${PORT}/`);
  });
}
