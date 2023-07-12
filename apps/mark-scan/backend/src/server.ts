import { Server } from 'http';
import {
  ArtifactAuthenticator,
  ArtifactAuthenticatorApi,
  InsertedSmartCardAuth,
  InsertedSmartCardAuthApi,
  JavaCard,
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
import { PaperHandlerStateMachine } from './custom-paper-handler/state_machine';

export interface StartOptions {
  auth?: InsertedSmartCardAuthApi;
  artifactAuthenticator?: ArtifactAuthenticatorApi;
  logger: Logger;
  port: number | string;
  workspace: Workspace;
  // Allow undefined state machine to fail gracefully if no connection to paper handler
  stateMachine?: PaperHandlerStateMachine;
}

/**
 * Starts the server with all the default options.
 */
export function start({
  auth,
  artifactAuthenticator,
  logger,
  port,
  workspace,
  stateMachine,
}: StartOptions): Server {
  /* istanbul ignore next */
  const resolvedAuth =
    auth ??
    new InsertedSmartCardAuth({
      card:
        isFeatureFlagEnabled(BooleanEnvironmentVariableName.USE_MOCK_CARDS) ||
        isIntegrationTest()
          ? new MockFileCard()
          : new JavaCard(),
      config: {
        allowCardlessVoterSessions: true,
        allowElectionManagersToAccessMachinesConfiguredForOtherElections: true,
      },
      logger,
    });
  /* istanbul ignore next */
  const resolvedArtifactAuthenticator =
    artifactAuthenticator ?? new ArtifactAuthenticator();

  const usb: Usb = { getUsbDrives };

  const app = buildApp(
    resolvedAuth,
    resolvedArtifactAuthenticator,
    logger,
    workspace,
    usb,
    stateMachine
  );

  return app.listen(
    port,
    /* istanbul ignore next */
    async () => {
      await logger.log(LogEventId.ApplicationStartup, 'system', {
        message: `VxMarkScan backend running at http://localhost:${port}/`,
        disposition: 'success',
      });
    }
  );
}
