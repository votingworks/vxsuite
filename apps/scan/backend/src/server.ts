import {
  ArtifactAuthenticator,
  ArtifactAuthenticatorApi,
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
import { PrecinctScannerStateMachine } from './types';
import { Workspace } from './util/workspace';

export interface StartOptions {
  auth?: InsertedSmartCardAuthApi;
  artifactAuthenticator?: ArtifactAuthenticatorApi;
  logger?: Logger;
  port?: number | string;
  precinctScannerStateMachine: PrecinctScannerStateMachine;
  workspace: Workspace;
}

/**
 * Starts the server.
 */
export function start({
  auth,
  artifactAuthenticator,
  logger = new Logger(LogSource.VxScanBackend),
  precinctScannerStateMachine,
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
  const resolvedArtifactAuthenticator =
    artifactAuthenticator ?? new ArtifactAuthenticator();

  const usbDrive = detectUsbDrive();

  // Clear any cached data
  workspace.clearUploads();

  const app = buildApp(
    resolvedAuth,
    resolvedArtifactAuthenticator,
    precinctScannerStateMachine,
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
