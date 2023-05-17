import {
  InsertedSmartCardAuth,
  InsertedSmartCardAuthApi,
  JavaCard,
  MockFileCard,
} from '@votingworks/auth';
import { LogEventId, Logger, LogSource } from '@votingworks/logging';
import { detectUsbDrive } from '@votingworks/usb-drive';
import {
  BooleanEnvironmentVariableName,
  isFeatureFlagEnabled,
  isIntegrationTest,
} from '@votingworks/utils';
import { buildApp } from './app';
import { PORT } from './globals';
import { PrecinctScannerInterpreter } from './interpret';
import { PrecinctScannerStateMachine } from './types';
import { Workspace } from './util/workspace';

export interface StartOptions {
  auth?: InsertedSmartCardAuthApi;
  logger?: Logger;
  port?: number | string;
  precinctScannerInterpreter: PrecinctScannerInterpreter;
  precinctScannerStateMachine: PrecinctScannerStateMachine;
  workspace: Workspace;
}

/**
 * Starts the server.
 */
export function start({
  auth,
  logger = new Logger(LogSource.VxScanBackend),
  precinctScannerInterpreter,
  precinctScannerStateMachine,
  workspace,
}: StartOptions): void {
  /* istanbul ignore next */
  const resolvedAuth =
    auth ??
    new InsertedSmartCardAuth({
      card:
        isFeatureFlagEnabled(BooleanEnvironmentVariableName.USE_MOCK_CARDS) ||
        isIntegrationTest()
          ? new MockFileCard()
          : new JavaCard(),
      config: {},
      logger,
    });

  const usbDrive = detectUsbDrive();

  // Clear any cached data
  workspace.clearUploads();

  const app = buildApp(
    resolvedAuth,
    precinctScannerStateMachine,
    precinctScannerInterpreter,
    workspace,
    usbDrive,
    logger
  );

  app.listen(PORT, async () => {
    await logger.log(LogEventId.ApplicationStartup, 'system', {
      message: `VxScan backend running at http://localhost:${PORT}/`,
      disposition: 'success',
    });

    await logger.log(LogEventId.ScanServiceConfigurationMessage, 'system', {
      message: `Scanning ballots into ${workspace.ballotImagesPath}`,
    });
  });
}
