import {
  BaseLogger,
  LogEventId,
  LogSource,
  Logger,
} from '@votingworks/logging';
import { Application } from 'express';
import { DippedSmartCardAuth, JavaCard, MockFileCard } from '@votingworks/auth';
import { Server } from 'http';
import {
  BooleanEnvironmentVariableName,
  isFeatureFlagEnabled,
  isIntegrationTest,
} from '@votingworks/utils';
import { UsbDrive, detectUsbDrive } from '@votingworks/usb-drive';
import { detectDevices } from '@votingworks/backend';
import { PORT, SCAN_WORKSPACE } from './globals';
import { Importer } from './importer';
import { FujitsuScanner, BatchScanner, ScannerMode } from './fujitsu_scanner';
import { createWorkspace, Workspace } from './util/workspace';
import { buildCentralScannerApp } from './app';
import { getUserRole } from './util/auth';

export interface StartOptions {
  port: number | string;
  batchScanner: BatchScanner;
  usbDrive: UsbDrive;
  importer: Importer;
  app: Application;
  logger: BaseLogger;
  workspace: Workspace;
}

/**
 * Starts the server with all the default options.
 */
export async function start({
  port = PORT,
  batchScanner,
  usbDrive,
  importer,
  app,
  logger: baseLogger = new BaseLogger(LogSource.VxCentralScanService),
  workspace,
}: Partial<StartOptions> = {}): Promise<Server> {
  detectDevices({ logger: baseLogger });
  let resolvedWorkspace = workspace;
  /* c8 ignore start */
  if (!resolvedWorkspace) {
    const workspacePath = SCAN_WORKSPACE;
    if (!workspacePath) {
      await baseLogger.log(LogEventId.WorkspaceConfigurationMessage, 'system', {
        message:
          'workspace path could not be determined; pass a workspace or run with SCAN_WORKSPACE',
        disposition: 'failure',
      });
      throw new Error(
        'workspace path could not be determined; pass a workspace or run with SCAN_WORKSPACE'
      );
    }
    resolvedWorkspace = createWorkspace(workspacePath, baseLogger);
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
      logger: baseLogger,
    });

    const logger = Logger.from(baseLogger, () =>
      getUserRole(auth, resolvedWorkspace)
    );

    const resolvedBatchScanner =
      batchScanner ?? new FujitsuScanner({ mode: ScannerMode.Gray, logger });

    const resolvedImporter =
      importer ??
      new Importer({
        scanner: resolvedBatchScanner,
        workspace: resolvedWorkspace,
        logger,
      });

    const resolvedUsbDrive = usbDrive ?? detectUsbDrive(logger);

    resolvedApp = buildCentralScannerApp({
      auth,
      scanner: resolvedBatchScanner,
      importer: resolvedImporter,
      logger,
      usbDrive: resolvedUsbDrive,
      workspace: resolvedWorkspace,
    });
  }
  /* c8 ignore stop */

  return resolvedApp.listen(port, async () => {
    await baseLogger.log(LogEventId.ApplicationStartup, 'system', {
      message: `Scan Service running at http://localhost:${port}/`,
      disposition: 'success',
    });

    await baseLogger.log(LogEventId.WorkspaceConfigurationMessage, 'system', {
      message: `Scanning ballots into ${resolvedWorkspace.ballotImagesPath}`,
    });
  });
}
