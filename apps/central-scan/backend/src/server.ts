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
import { UsbDrive, detectUsbDrive } from '@votingworks/usb-drive';
import { detectDevices, startCpuMetricsLogging } from '@votingworks/backend';
import {
  DEFAULT_DEV_DOCK_DIR,
  useDevDockRouter,
} from '@votingworks/dev-dock-backend';
import { PORT, SCAN_WORKSPACE } from './globals';
import { Importer } from './importer';
import { FujitsuScanner, BatchScanner, ScannerMode } from './fujitsu_scanner';
import { MockBatchScanner } from './mock_batch_scanner';
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

    mockBatchScanner =
      !batchScanner &&
      isFeatureFlagEnabled(
        BooleanEnvironmentVariableName.USE_MOCK_CENTRAL_SCANNER
      )
        ? new MockBatchScanner(join(DEFAULT_DEV_DOCK_DIR, 'batch-images'))
        : undefined;

    const resolvedBatchScanner =
      batchScanner ??
      mockBatchScanner ??
      new FujitsuScanner({ mode: ScannerMode.Gray, logger });

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

  useDevDockRouter(resolvedApp, express, {
    mockBatchScanner,
  });

  // Start periodic CPU metrics logging
  startCpuMetricsLogging(baseLogger);

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
