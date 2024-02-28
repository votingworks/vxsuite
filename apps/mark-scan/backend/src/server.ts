import { Server } from 'http';
import { InsertedSmartCardAuthApi } from '@votingworks/auth';
import { LogEventId, BaseLogger, Logger } from '@votingworks/logging';

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
import { getPaperHandlerStateMachine } from './custom-paper-handler/state_machine';
import { getDefaultAuth, getUserRole } from './util/auth';
import {
  DEV_AUTH_STATUS_POLLING_INTERVAL_MS,
  DEV_DEVICE_STATUS_POLLING_INTERVAL_MS,
  SUCCESS_NOTIFICATION_DURATION_MS,
} from './custom-paper-handler/constants';
import { PatConnectionStatusReader } from './pat-input/connection_status_reader';
import { MockPatConnectionStatusReader } from './pat-input/mock_connection_status_reader';

const debug = makeDebug('mark-scan:server');

export interface StartOptions {
  auth?: InsertedSmartCardAuthApi;
  logger: BaseLogger;
  port: number | string;
  workspace: Workspace;
}

async function resolveDriver(
  logger: BaseLogger
): Promise<PaperHandlerDriverInterface | undefined> {
  const driver = await getPaperHandlerDriver();

  /* istanbul ignore next */
  if (driver) {
    await logger.log(LogEventId.PaperHandlerConnection, 'system', {
      disposition: 'success',
    });
    return driver;
  }

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
  return undefined;
}

/**
 * Starts the server with all the default options.
 */
export async function start({
  auth,
  logger: baseLogger,
  port,
  workspace,
}: StartOptions): Promise<Server> {
  const resolvedAuth = auth ?? getDefaultAuth(baseLogger);
  const logger = Logger.from(baseLogger, () =>
    getUserRole(resolvedAuth, workspace)
  );
  const driver = await resolveDriver(logger);
  let patConnectionStatusReader = new PatConnectionStatusReader(logger);
  const canReadPatConnectionStatus = await patConnectionStatusReader.open();

  if (!canReadPatConnectionStatus) {
    // Expect this branch if running on non-production hardware or in a test
    patConnectionStatusReader = new MockPatConnectionStatusReader(logger);
  }

  let stateMachine;
  // Allow the driver to start without a state machine for tests
  if (driver) {
    stateMachine = await getPaperHandlerStateMachine({
      workspace,
      auth: resolvedAuth,
      logger,
      driver,
      patConnectionStatusReader,
      devicePollingIntervalMs: DEV_DEVICE_STATUS_POLLING_INTERVAL_MS,
      authPollingIntervalMs: DEV_AUTH_STATUS_POLLING_INTERVAL_MS,
      notificationDurationMs: SUCCESS_NOTIFICATION_DURATION_MS,
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
