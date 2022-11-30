//
// Just the HTTP glue to the functionality, no implementations.
// All actual implementations are in importer.ts and scanner.ts
//

import { Logger, LogEventId, LogSource } from '@votingworks/logging';
import express, { Application } from 'express';
import { createClient } from '@votingworks/plustek-sdk';
import { assert } from '@votingworks/utils';
import { PORT, SCAN_WORKSPACE, VX_MACHINE_TYPE } from './globals';
import { Importer } from './importer';
import { FujitsuScanner, BatchScanner, ScannerMode } from './fujitsu_scanner';
import { createWorkspace, Workspace } from './util/workspace';
import * as workers from './workers/combined';
import { childProcessPool, WorkerPool } from './workers/pool';
import {
  CreatePlustekClient,
  createPrecinctScannerStateMachine,
} from './precinct_scanner_state_machine';
import { buildPrecinctScannerApp } from './precinct_scanner_app';
import { buildCentralScannerApp } from './central_scanner_app';
import { createInterpreter } from './precinct_scanner_interpreter';

export interface StartOptions {
  port: number | string;
  batchScanner: BatchScanner;
  importer: Importer;
  app: Application;
  createPlustekClient: CreatePlustekClient;
  logger: Logger;
  workspace: Workspace;
  machineType: 'bsd' | 'precinct-scanner';
}

/**
 * Starts the server with all the default options.
 */
export async function start({
  port = PORT,
  batchScanner,
  importer,
  createPlustekClient = createClient,
  app,
  logger = new Logger(LogSource.VxScanService),
  workspace,
  machineType = VX_MACHINE_TYPE,
}: Partial<StartOptions> = {}): Promise<void> {
  if (!VX_MACHINE_TYPE) {
    throw new Error(
      'Environment variable VX_MACHINE_TYPE must be set to "bsd" or "precinct-scanner"'
    );
  }

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

  let resolvedApp: express.Application;

  if (machineType === 'precinct-scanner') {
    const precinctScannerInterpreter = createInterpreter();
    const precinctScannerMachine = createPrecinctScannerStateMachine({
      createPlustekClient,
      workspace: resolvedWorkspace,
      interpreter: precinctScannerInterpreter,
      logger,
    });
    resolvedApp = buildPrecinctScannerApp(
      precinctScannerMachine,
      precinctScannerInterpreter,
      resolvedWorkspace,
      logger
    );
  } else {
    assert(machineType === 'bsd');
    const resolvedBatchScanner =
      batchScanner ?? new FujitsuScanner({ mode: ScannerMode.Gray, logger });
    let workerPool: WorkerPool<workers.Input, workers.Output> | undefined;
    // eslint-disable-next-line no-inner-declarations
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
    resolvedApp =
      app ??
      (await buildCentralScannerApp({
        importer: resolvedImporter,
        workspace: resolvedWorkspace,
      }));

    // cleanup incomplete batches from before
    resolvedWorkspace.store.cleanupIncompleteBatches();
  }

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
