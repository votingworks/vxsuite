import { getUsbDrives, Usb } from '@votingworks/backend';
import { Logger, LogEventId, LogSource } from '@votingworks/logging';
import { Application } from 'express';
import { DippedSmartCardAuth, JavaCard, MockFileCard } from '@votingworks/auth';
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
  /* istanbul ignore next */
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

  // Clear any cached data
  resolvedWorkspace.clearUploads();
  resolvedWorkspace.store.cleanupIncompleteBatches();

  let resolvedApp = app;
  /* istanbul ignore next */
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
      importer: resolvedImporter,
      logger,
      usb: resolvedUsb,
      workspace: resolvedWorkspace,
    });
  }

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
