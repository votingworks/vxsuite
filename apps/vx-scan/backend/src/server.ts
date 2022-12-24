import path from 'path';

import {
  interpret,
  OpenCvInterpreter,
} from '@votingworks/ballot-interpreter-nh';
import { Logger, LogEventId, LogSource } from '@votingworks/logging';
import { createClient } from '@votingworks/plustek-sdk';
import { PORT, SCAN_WORKSPACE } from './globals';
import { createWorkspace, Workspace } from './util/workspace';
import {
  CreatePlustekClient,
  createPrecinctScannerStateMachine,
} from './state_machine';
import { buildApp } from './app';
import { createInterpreter } from './interpret';

export interface StartOptions {
  port: number | string;
  createPlustekClient: CreatePlustekClient;
  logger: Logger;
  workspace: Workspace;
}

async function testCvInterpreter(workspace: Workspace) {
  const { store } = workspace;

  const electionDefinition = store.getElectionDefinition();
  if (!electionDefinition) {
    throw new Error('no election definition');
  }

  const openCvResult = await new OpenCvInterpreter(electionDefinition, {
    isTestMode: false,
    markThresholds: store.getMarkThresholdOverrides(),
    adjudicationReasons:
      electionDefinition.election.precinctScanAdjudicationReasons ?? [],
  }).run([
    path.join(workspace.scannedImagesPath, 'PIC-1671039574-001.jpg'),
    path.join(workspace.scannedImagesPath, 'PIC-1671039574-002.jpg'),
    // path.resolve(
    //   __dirname,
    //   '../../../../libs/fixtures/data/electionGridLayoutNewHampshireAmherst/scan-marked-stretch-extra-front.jpeg'
    // ),
    // path.resolve(
    //   __dirname,
    //   '../../../../libs/fixtures/data/electionGridLayoutNewHampshireAmherst/scan-marked-stretch-extra-back.jpeg'
    // ),
  ]);

  console.log('openCV result:', openCvResult);
}

async function testCanvasInterpreterBak(workspace: Workspace) {
  const { store } = workspace;

  const electionDefinition = store.getElectionDefinition();
  if (!electionDefinition) {
    throw new Error('no election definition');
  }

  const canvasResult = await interpret(
    electionDefinition,
    [
      path.join(workspace.scannedImagesPath, 'PIC-1671041023-001.jpg'),
      path.join(workspace.scannedImagesPath, 'PIC-1671041023-002.jpg'),
    ],
    {
      isTestMode: false,
      markThresholds: store.getMarkThresholdOverrides(),
      adjudicationReasons:
        electionDefinition.election.precinctScanAdjudicationReasons ?? [],
    }
  );

  console.log('canvas result:', canvasResult);
}

/**
 * Starts the server with all the default options.
 */
export async function start({
  port = PORT,
  createPlustekClient = createClient,
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

  const precinctScannerInterpreter = createInterpreter();
  const precinctScannerMachine = createPrecinctScannerStateMachine({
    createPlustekClient,
    workspace: resolvedWorkspace,
    interpreter: precinctScannerInterpreter,
    logger,
  });
  const app = buildApp(
    precinctScannerMachine,
    precinctScannerInterpreter,
    resolvedWorkspace,
    logger
  );

  app.listen(port, async () => {
    await logger.log(LogEventId.ApplicationStartup, 'system', {
      message: `VxScan backend running at http://localhost:${port}/`,
      disposition: 'success',
    });

    if (resolvedWorkspace) {
      await logger.log(LogEventId.ScanServiceConfigurationMessage, 'system', {
        message: `Scanning ballots into ${resolvedWorkspace.ballotImagesPath}`,
      });

      console.warn('starting...');
      console.warn('starting...');
      console.warn('starting...');
      try {
        await testCvInterpreter(resolvedWorkspace);
      } catch (error) {
        console.error(error);
      }
    }
  });
}
