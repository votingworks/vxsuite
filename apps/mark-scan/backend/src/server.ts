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
import { detectDevices, initializeSystemAudio } from '@votingworks/backend';
import { buildApp } from './app';
import { Workspace } from './util/workspace';
import { getPaperHandlerStateMachine } from './custom-paper-handler/state_machine';
import { getDefaultAuth, getUserRole } from './util/auth';
import {
  DEV_AUTH_STATUS_POLLING_INTERVAL_MS,
  DEV_DEVICE_STATUS_POLLING_INTERVAL_MS,
  NOTIFICATION_DURATION_MS,
} from './custom-paper-handler/constants';
import {
  PatConnectionStatusReader,
  PatConnectionStatusReaderInterface,
} from './pat-input/connection_status_reader';
import { MockPatConnectionStatusReader } from './pat-input/mock_connection_status_reader';

export interface StartOptions {
  auth?: InsertedSmartCardAuthApi;
  logger: BaseLogger;
  port: number | string;
  workspace: Workspace;
}

export async function resolveDriver(
  logger: BaseLogger
): Promise<PaperHandlerDriverInterface | undefined> {
  if (
    isFeatureFlagEnabled(BooleanEnvironmentVariableName.USE_MOCK_PAPER_HANDLER)
  ) {
    await logger.log(LogEventId.PaperHandlerConnection, 'system', {
      message: 'Starting server with mock paper handler',
    });
    return new MockPaperHandlerDriver();
  }

  const driver = await getPaperHandlerDriver();

  if (driver) {
    await logger.log(LogEventId.PaperHandlerConnection, 'system', {
      disposition: 'success',
    });
    return driver;
  }

  await logger.log(LogEventId.PaperHandlerConnection, 'system', {
    disposition: 'failure',
  });
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
  detectDevices({ logger: baseLogger });
  const resolvedAuth = auth ?? getDefaultAuth(baseLogger);
  const logger = Logger.from(baseLogger, () =>
    getUserRole(resolvedAuth, workspace)
  );
  const driver = await resolveDriver(logger);
  let patConnectionStatusReader: PatConnectionStatusReaderInterface =
    new PatConnectionStatusReader(logger);
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
      notificationDurationMs: NOTIFICATION_DURATION_MS,
    });
  }

  const usbDrive = detectUsbDrive(logger);

  await initializeSystemAudio();

  const app = buildApp(
    resolvedAuth,
    logger,
    workspace,
    usbDrive,
    stateMachine,
    driver
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
