import express, { Application } from 'express';
import {
  BaseLogger,
  LogEventId,
  LogSource,
  Logger,
} from '@votingworks/logging';
import { DippedSmartCardAuth, JavaCard, MockFileCard } from '@votingworks/auth';
import { Server } from 'node:http';
import { join } from 'node:path';
import {
  BooleanEnvironmentVariableName,
  isFeatureFlagEnabled,
  isIntegrationTest,
} from '@votingworks/utils';
import { UsbDrive, detectUsbDriveFromEnv } from '@votingworks/usb-drive';
import { detectDevices, startCpuMetricsLogging } from '@votingworks/backend';
import {
  DEFAULT_DEV_DOCK_DIR,
  useDevDockRouter,
} from '@votingworks/dev-dock-backend';
import { getScanWorkspace, PORT } from './globals.js';
import { Importer } from './importer.js';
import { FujitsuScanner, ScannerMode } from './fujitsu_scanner.js';
import { MockBatchScanner } from './mock_batch_scanner.js';
import { createWorkspace, Workspace } from './util/workspace.js';
import { buildCentralScannerApp } from './app.js';
import { getUserRole } from './util/auth.js';
import { isCentralScanNetworkingEnabled } from './networking_config.js';
import { startScannerNetworking } from './networking.js';
import { startCvrSync } from './cvr_sync.js';

export interface StartOptions {
  port: number | string;
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
  usbDrive,
  importer,
  app,
  logger: baseLogger = new BaseLogger(LogSource.VxCentralScanService),
  workspace,
}: Partial<StartOptions> = {}): Server {
  const stopDetectingDevices = detectDevices({ logger: baseLogger });
  let resolvedWorkspace = workspace;
  /* istanbul ignore next */
  if (!resolvedWorkspace) {
    const workspacePath = getScanWorkspace();
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

  const sheetCount = resolvedWorkspace.store.getBallotsCounted();
  if (sheetCount > 0) {
    baseLogger.log(LogEventId.DataCheckOnStartup, 'system', {
      message:
        'Scanned ballot data is present in the database at machine startup.',
      sheetCount,
    });
  } else {
    baseLogger.log(LogEventId.DataCheckOnStartup, 'system', {
      message:
        'No scanned ballot data is present in the database at machine startup.',
      sheetCount,
    });
  }

  // Clear any cached data
  resolvedWorkspace.clearUploads();
  resolvedWorkspace.store.cleanupIncompleteBatches();

  let resolvedApp = app;
  let mockBatchScanner: MockBatchScanner | undefined;
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

    mockBatchScanner = isFeatureFlagEnabled(
      BooleanEnvironmentVariableName.USE_MOCK_CENTRAL_SCANNER
    )
      ? new MockBatchScanner(join(DEFAULT_DEV_DOCK_DIR, 'batch-images'))
      : undefined;

    const resolvedBatchScanner =
      mockBatchScanner ??
      new FujitsuScanner({ mode: ScannerMode.Gray, logger });

    const resolvedImporter =
      importer ??
      new Importer({
        scanner: resolvedBatchScanner,
        workspace: resolvedWorkspace,
        logger,
      });

    const resolvedUsbDrive = usbDrive ?? detectUsbDriveFromEnv({ logger });

    resolvedApp = buildCentralScannerApp({
      auth,
      scanner: resolvedBatchScanner,
      importer: resolvedImporter,
      logger,
      usbDrive: resolvedUsbDrive,
      workspace: resolvedWorkspace,
    });
  }

  if (isCentralScanNetworkingEnabled()) {
    startScannerNetworking({
      logger: baseLogger,
      store: resolvedWorkspace.store,
    });
    startCvrSync({
      logger: baseLogger,
      store: resolvedWorkspace.store,
    });
  }

  useDevDockRouter(resolvedApp, express, {
    mockBatchScanner,
  });

  // Start periodic CPU metrics logging
  startCpuMetricsLogging(baseLogger);

  const server = resolvedApp.listen(port, () => {
    baseLogger.log(LogEventId.ApplicationStartup, 'system', {
      message: `Scan Service running at http://localhost:${port}/`,
      disposition: 'success',
    });

    baseLogger.log(LogEventId.WorkspaceConfigurationMessage, 'system', {
      message: `Scanning ballots into ${resolvedWorkspace.ballotImagesPath}`,
    });
  });
  server.on('close', stopDetectingDevices);
  return server;
}
