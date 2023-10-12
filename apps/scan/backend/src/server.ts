import {
  InsertedSmartCardAuth,
  InsertedSmartCardAuthApi,
  JavaCard,
  MockFileCard,
} from '@votingworks/auth';
import { LogEventId, Logger, LogSource } from '@votingworks/logging';
import { detectUsbDrive, UsbDrive } from '@votingworks/usb-drive';
import {
  BooleanEnvironmentVariableName,
  isFeatureFlagEnabled,
  isIntegrationTest,
} from '@votingworks/utils';
import { buildApp } from './app';
import { PORT } from './globals';
import { PrecinctScannerStateMachine } from './types';
import { Workspace } from './util/workspace';

export interface StartOptions {
  auth?: InsertedSmartCardAuthApi;
  logger?: Logger;
  port?: number | string;
  precinctScannerStateMachine: PrecinctScannerStateMachine;
  usbDrive?: UsbDrive;
  workspace: Workspace;
}

/**
 * Starts the server.
 */
export function start({
  auth,
  logger = new Logger(LogSource.VxScanBackend),
  precinctScannerStateMachine,
  usbDrive,
  workspace,
}: StartOptions): void {
  /* c8 ignore start */
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
  /* c8 ignore stop */

  const resolvedUsbDrive = usbDrive ?? detectUsbDrive(logger);

  // Clear any cached data
  workspace.clearUploads();

  const app = buildApp(
    resolvedAuth,
    precinctScannerStateMachine,
    workspace,
    resolvedUsbDrive,
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
