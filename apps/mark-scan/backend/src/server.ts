import { Server } from 'http';
import { InsertedSmartCardAuthApi } from '@votingworks/auth';
import { LogEventId, Logger } from '@votingworks/logging';

import { getPaperHandlerDriver } from '@votingworks/custom-paper-handler';
import { isIntegrationTest } from '@votingworks/utils';
import { detectUsbDrive, MockFileUsbDrive } from '@votingworks/usb-drive';
import { buildApp } from './app';
import { Workspace } from './util/workspace';
import {
  getPaperHandlerStateMachine,
  PaperHandlerStateMachine,
} from './custom-paper-handler/state_machine';
import { getDefaultAuth } from './util/auth';
import {
  DEV_AUTH_STATUS_POLLING_INTERVAL_MS,
  DEV_PAPER_HANDLER_STATUS_POLLING_INTERVAL_MS,
} from './custom-paper-handler/constants';

export interface StartOptions {
  auth?: InsertedSmartCardAuthApi;
  logger: Logger;
  port: number | string;
  workspace: Workspace;
  // Allow undefined state machine to fail gracefully if no connection to paper handler
  stateMachine?: PaperHandlerStateMachine;
}

/**
 * Starts the server with all the default options.
 */
export async function start({
  auth,
  logger,
  port,
  workspace,
}: StartOptions): Promise<Server> {
  /* istanbul ignore next */
  const resolvedAuth = auth ?? getDefaultAuth(logger);

  const paperHandlerDriver = await getPaperHandlerDriver();
  const stateMachine = paperHandlerDriver
    ? await getPaperHandlerStateMachine(
        paperHandlerDriver,
        workspace,
        resolvedAuth,
        logger,
        DEV_PAPER_HANDLER_STATUS_POLLING_INTERVAL_MS,
        DEV_AUTH_STATUS_POLLING_INTERVAL_MS
      )
    : undefined;

  const usbDrive = isIntegrationTest()
    ? new MockFileUsbDrive()
    : detectUsbDrive(logger);

  const app = buildApp(resolvedAuth, logger, workspace, usbDrive, stateMachine);

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
