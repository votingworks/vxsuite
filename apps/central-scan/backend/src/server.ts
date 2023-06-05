import { getUsbDrives, Usb } from '@votingworks/backend';
import { Logger, LogEventId, LogSource } from '@votingworks/logging';
import { Application } from 'express';
import {
  ArtifactAuthenticator,
  DippedSmartCardAuth,
  JavaCard,
  MockFileCard,
} from '@votingworks/auth';
import { Server } from 'http';
import {
  BooleanEnvironmentVariableName,
  isFeatureFlagEnabled,
  isIntegrationTest,
} from '@votingworks/utils';
import { PORT, SCAN_WORKSPACE } from './globals';
import { Importer } from './importer';
import { FujitsuScanner, BatchScanner, ScannerMode } from './fujitsu_scanner';
import { createWorkspace, Workspace } from './util/workspace';
import { buildCentralScannerApp } from './central_scanner_app';

export interface StartOptions {
  port: number | string;
  batchScanner: BatchScanner;
  usb: Usb;
  importer: Importer;
  app: Application;
  logger: Logger;
  workspace: Workspace;
}

/**
 * Starts the server with all the default options.
 */
export async function start({
  port = PORT,
  batchScanner,
  usb,
  importer,
  app,
  logger = new Logger(LogSource.VxScanService),
  workspace,
}: Partial<StartOptions> = {}): Promise<Server> {
  let resolvedWorkspace = workspace;
  /* c8 ignore start */
  if (!resolvedWorkspace) {
    const workspacePath = SCAN_WORKSPACE;
    if (!workspacePath) {
      await logger.log(LogEventId.ScanServiceConfigurationMessage, 'system', {
        message:
          'workspace path could not be determined; pass a workspace or run with SCAN_WORKSPACE',
        disposition: 'failure',
      });
      throw new Error(
        'workspace path could not be determined; pass a workspace or run with SCAN_WORKSPACE'
      );
    }
    resolvedWorkspace = createWorkspace(workspacePath);
  }
  /* c8 ignore stop */

  // Clear any cached data
  resolvedWorkspace.clearUploads();
  resolvedWorkspace.store.cleanupIncompleteBatches();

  let resolvedApp = app;
  /* c8 ignore start */
  if (!resolvedApp) {
    const auth = new DippedSmartCardAuth({
      card:
        isFeatureFlagEnabled(BooleanEnvironmentVariableName.USE_MOCK_CARDS) ||
        isIntegrationTest()
          ? new MockFileCard()
          : new JavaCard(),
      config: {
        allowElectionManagersToAccessUnconfiguredMachines: true,
      },
      logger,
    });
    const artifactAuthenticator = new ArtifactAuthenticator();

    const resolvedBatchScanner =
      batchScanner ?? new FujitsuScanner({ mode: ScannerMode.Gray, logger });

    const resolvedImporter =
      importer ??
      new Importer({
        scanner: resolvedBatchScanner,
        workspace: resolvedWorkspace,
      });

    const resolvedUsb = usb ?? { getUsbDrives };

    resolvedApp = buildCentralScannerApp({
      auth,
      artifactAuthenticator,
      importer: resolvedImporter,
      logger,
      usb: resolvedUsb,
      workspace: resolvedWorkspace,
    });
  }
  /* c8 ignore stop */

  return resolvedApp.listen(port, async () => {
    await logger.log(LogEventId.ApplicationStartup, 'system', {
      message: `Scan Service running at http://localhost:${port}/`,
      disposition: 'success',
    });

    if (resolvedWorkspace) {
      await logger.log(LogEventId.ScanServiceConfigurationMessage, 'system', {
        message: `Scanning ballots into ${resolvedWorkspace.ballotImagesPath}`,
      });
    }
  });
}
