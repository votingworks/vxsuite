import { Logger, LogEventId, LogSource } from '@votingworks/logging';
import { Application } from 'express';
import { PORT, SCAN_WORKSPACE } from './globals';
import { Importer } from './importer';
import { FujitsuScanner, BatchScanner, ScannerMode } from './fujitsu_scanner';
import { createWorkspace, Workspace } from './util/workspace';
import * as workers from './workers/combined';
import { childProcessPool, WorkerPool } from './workers/pool';
import { buildCentralScannerApp } from './central_scanner_app';

export interface StartOptions {
  port: number | string;
  batchScanner: BatchScanner;
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
  importer,
  app,
  logger = new Logger(LogSource.VxScanService),
  workspace,
}: Partial<StartOptions> = {}): Promise<void> {
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

  const resolvedApp =
    app ??
    (await buildCentralScannerApp({
      importer: resolvedImporter,
      workspace: resolvedWorkspace,
    }));

  // cleanup incomplete batches from before
  resolvedWorkspace.store.cleanupIncompleteBatches();

  resolvedApp.listen(port, async () => {
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
