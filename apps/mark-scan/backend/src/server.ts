import { Server } from 'http';
import { InsertedSmartCardAuthApi } from '@votingworks/auth';
import { LogEventId, Logger } from '@votingworks/logging';

import {
  getPaperHandlerDriver,
  MockPaperHandlerDriver,
  PaperHandlerDriverInterface,
} from '@votingworks/custom-paper-handler';
import {
  BooleanEnvironmentVariableName,
  isFeatureFlagEnabled,
} from '@votingworks/utils';
import { detectUsbDrive } from '@votingworks/usb-drive';
import makeDebug from 'debug';
import { buildApp } from './app';
import { Workspace } from './util/workspace';
import {
  getPaperHandlerStateMachine,
  PaperHandlerStateMachine,
} from './custom-paper-handler/state_machine';
import { getDefaultAuth } from './util/auth';
import {
  DEV_AUTH_STATUS_POLLING_INTERVAL_MS,
  DEV_DEVICE_STATUS_POLLING_INTERVAL_MS,
} from './custom-paper-handler/constants';
import { PatConnectionStatusReader } from './pat-input/connection_status_reader';
import { MockPatConnectionStatusReader } from './pat-input/mock_connection_status_reader';

const debug = makeDebug('mark-scan:server');

export interface StartOptions {
  auth?: InsertedSmartCardAuthApi;
  logger: Logger;
  port: number | string;
  workspace: Workspace;
  // Allow undefined state machine to fail gracefully if no connection to paper handler
  stateMachine?: PaperHandlerStateMachine;
}

async function resolveDriver(
  logger: Logger
): Promise<PaperHandlerDriverInterface | undefined> {
  const driver = await getPaperHandlerDriver();

  if (!driver) {
    await logger.log(LogEventId.PaperHandlerConnection, 'system', {
      disposition: 'failure',
    });

    if (
      isFeatureFlagEnabled(
        BooleanEnvironmentVariableName.SKIP_PAPER_HANDLER_HARDWARE_CHECK
      )
    ) {
      debug('No paper handler found. Starting server with mock driver');
      return new MockPaperHandlerDriver();
    }
  } else {
    await logger.log(LogEventId.PaperHandlerConnection, 'system', {
      disposition: 'success',
    });
  }

  return driver;
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
  const driver = await resolveDriver(logger);
  let patConnectionStatusReader = new PatConnectionStatusReader(logger);
  const canReadPatConnectionStatus = await patConnectionStatusReader.open();

  if (!canReadPatConnectionStatus) {
    // Expect this branch if running on non-production hardware or in a test
    patConnectionStatusReader = new MockPatConnectionStatusReader(logger);
  }

  let stateMachine;
  if (driver) {
    stateMachine = await getPaperHandlerStateMachine({
      workspace,
      auth: resolvedAuth,
      logger,
      driver,
      patConnectionStatusReader,
      devicePollingIntervalMs: DEV_DEVICE_STATUS_POLLING_INTERVAL_MS,
      authPollingIntervalMs: DEV_AUTH_STATUS_POLLING_INTERVAL_MS,
    });
  }

  const usbDrive = detectUsbDrive(logger);

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
