import { Exporter, getUsbDrives } from '@votingworks/backend';
import { Logger, LogEventId, LogSource } from '@votingworks/logging';
import { Application } from 'express';
import { DippedSmartCardAuthWithMemoryCard } from '@votingworks/auth';
import { WebServiceCard } from '@votingworks/utils';
import { Server } from 'http';
import { PORT, SCAN_ALLOWED_EXPORT_PATTERNS, SCAN_WORKSPACE } from './globals';
import { Importer } from './importer';
import { FujitsuScanner, BatchScanner, ScannerMode } from './fujitsu_scanner';
import { createWorkspace, Workspace } from './util/workspace';
import * as workers from './workers/combined';
import { childProcessPool, WorkerPool } from './workers/pool';
import { buildCentralScannerApp } from './central_scanner_app';

export interface StartOptions {
  port: number | string;
  batchScanner: BatchScanner;
  exporter: Exporter;
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
  exporter,
  importer,
  app,
  logger = new Logger(LogSource.VxScanService),
  workspace,
}: Partial<StartOptions> = {}): Promise<Server> {
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
  let workerPool: WorkerPool<workers.Input, workers.Output> | undefined;

  function workerPoolProvider(): WorkerPool<workers.Input, workers.Output> {
    workerPool ??= childProcessPool(
      workers.workerPath,
      2 /* front and back */
    ) as WorkerPool<workers.Input, workers.Output>;
    return workerPool;
  }
  const resolvedImporter =
    importer ??
    new Importer({
      workspace: resolvedWorkspace,
      scanner: resolvedBatchScanner,
      workerPoolProvider,
    });
  const resolvedExporter =
    exporter ??
    new Exporter({
      allowedExportPatterns: SCAN_ALLOWED_EXPORT_PATTERNS,
      getUsbDrives,
    });

  const resolvedApp =
    app ??
    (await buildCentralScannerApp({
      auth: new DippedSmartCardAuthWithMemoryCard({
        card: new WebServiceCard({ baseUrl: 'http://localhost:3001' }),
        config: {
          allowElectionManagersToAccessUnconfiguredMachines: true,
        },
      }),
      exporter: resolvedExporter,
      importer: resolvedImporter,
      workspace: resolvedWorkspace,
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
