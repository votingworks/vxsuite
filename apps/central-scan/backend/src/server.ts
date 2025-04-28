import express, { Application } from 'express';
import {
  BaseLogger,
  LogEventId,
  LogSource,
  Logger,
} from '@votingworks/logging';
import { DippedSmartCardAuth, JavaCard, MockFileCard } from '@votingworks/auth';
import { Server } from 'node:http';
import {
  BooleanEnvironmentVariableName,
  isFeatureFlagEnabled,
  isIntegrationTest,
} from '@votingworks/utils';
import { UsbDrive, detectUsbDrive } from '@votingworks/usb-drive';
import { detectDevices } from '@votingworks/backend';
import { useDevDockRouter } from '@votingworks/dev-dock-backend';
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
export function start({
  port = PORT,
  batchScanner,
  usbDrive,
  importer,
  app,
  logger: baseLogger = new BaseLogger(LogSource.VxCentralScanService),
  workspace,
}: Partial<StartOptions> = {}): Server {
  detectDevices({ logger: baseLogger });
  let resolvedWorkspace = workspace;
  /* istanbul ignore next - @preserve */
  if (!resolvedWorkspace) {
    const workspacePath = SCAN_WORKSPACE;
    if (!workspacePath) {
      baseLogger.log(LogEventId.WorkspaceConfigurationMessage, 'system', {
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

  // Clear any cached data
  resolvedWorkspace.clearUploads();
  resolvedWorkspace.store.cleanupIncompleteBatches();

  let resolvedApp = app;
  /* istanbul ignore next - @preserve */
  if (!resolvedApp) {
    const auth = new DippedSmartCardAuth({
      card:
        isFeatureFlagEnabled(BooleanEnvironmentVariableName.USE_MOCK_CARDS) ||
        isIntegrationTest()
          ? new MockFileCard()
          : new JavaCard(),
      config: {
        allowElectionManagersToAccessUnconfiguredMachines: true,
        allowedUserRoles: [
          'vendor',
          'system_administrator',
          'election_manager',
        ],
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

  useDevDockRouter(resolvedApp, express, {});

  return resolvedApp.listen(port, () => {
    baseLogger.log(LogEventId.ApplicationStartup, 'system', {
      message: `Scan Service running at http://localhost:${port}/`,
      disposition: 'success',
    });

    baseLogger.log(LogEventId.WorkspaceConfigurationMessage, 'system', {
      message: `Scanning ballots into ${resolvedWorkspace.ballotImagesPath}`,
    });
  });
}
