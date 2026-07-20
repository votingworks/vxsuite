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
import { MOCK_SCANNER_SHEET_COPIES, PORT, SCAN_WORKSPACE } from './globals';
import { Importer } from './importer';
import { FujitsuScanner, ScannerMode } from './fujitsu_scanner';
import { DeskProScanner } from './deskpro_scanner';
import { MockBatchScanner } from './mock_batch_scanner';
import { createWorkspace, Workspace } from './util/workspace';
import { buildCentralScannerApp } from './app';
import { startScannerNetworking } from './networking';
import { getUserRole } from './util/auth';

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
  detectDevices({ logger: baseLogger });
  let resolvedWorkspace = workspace;
  /* istanbul ignore next */
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
          'poll_worker',
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
      ? new MockBatchScanner(
          join(DEFAULT_DEV_DOCK_DIR, 'batch-images'),
          MOCK_SCANNER_SHEET_COPIES
        )
      : undefined;

    // PoC: DESKPRO_SCANNER=1 selects the InoTec SCAMAX DeskPro over the WS
    // bridge instead of the Fujitsu (scanimage). See deskpro_scanner.ts. This
    // selection isn't exercised in tests, hence the coverage ignore.
    /* istanbul ignore start */
    const isDeskProScanner = Boolean(process.env['DESKPRO_SCANNER']);
    const resolvedBatchScanner =
      mockBatchScanner ??
      (isDeskProScanner
        ? new DeskProScanner({ logger })
        : new FujitsuScanner({ mode: ScannerMode.Gray, logger }));
    /* istanbul ignore stop */

    const resolvedImporter =
      importer ??
      new Importer({
        scanner: resolvedBatchScanner,
        workspace: resolvedWorkspace,
        logger,
      });

    const resolvedUsbDrive = usbDrive ?? detectUsbDriveFromEnv({ logger });

    const adminHostClient = startScannerNetworking({ logger: baseLogger });

    resolvedApp = buildCentralScannerApp({
      auth,
      scanner: resolvedBatchScanner,
      importer: resolvedImporter,
      logger,
      usbDrive: resolvedUsbDrive,
      workspace: resolvedWorkspace,
      adminHostClient,
      isDeskProScanner,
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
