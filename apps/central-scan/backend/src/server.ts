import { getUsbDrives, Usb } from '@votingworks/backend';
import { Logger, LogEventId, LogSource } from '@votingworks/logging';
import { Application } from 'express';
import {
  constructJavaCardConfig,
  DippedSmartCardAuth,
  JavaCard,
  MemoryCard,
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
  const auth = new DippedSmartCardAuth({
    card:
      isFeatureFlagEnabled(BooleanEnvironmentVariableName.USE_MOCK_CARDS) ||
      isIntegrationTest()
        ? /* istanbul ignore next */ new MockFileCard()
        : isFeatureFlagEnabled(BooleanEnvironmentVariableName.ENABLE_JAVA_CARDS)
        ? /* istanbul ignore next */ new JavaCard(constructJavaCardConfig())
        : new MemoryCard({ baseUrl: 'http://localhost:3001' }),
    config: {
      allowElectionManagersToAccessUnconfiguredMachines: true,
    },
    logger,
  });
  let resolvedWorkspace: Workspace;

  if (workspace) {
    resolvedWorkspace = workspace;
  } else {
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
    resolvedWorkspace = await createWorkspace(workspacePath);
  }

  // clear any cached data
  resolvedWorkspace.clearUploads();

  const resolvedBatchScanner =
    batchScanner ?? new FujitsuScanner({ mode: ScannerMode.Gray, logger });

  const resolvedImporter =
    importer ??
    new Importer({
      workspace: resolvedWorkspace,
      scanner: resolvedBatchScanner,
    });
  const resolvedUsb = usb ?? {
    getUsbDrives,
  };

  const resolvedApp =
    app ??
    (await buildCentralScannerApp({
      auth,
      usb: resolvedUsb,
      importer: resolvedImporter,
      workspace: resolvedWorkspace,
      logger,
    }));

  // cleanup incomplete batches from before
  resolvedWorkspace.store.cleanupIncompleteBatches();

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
