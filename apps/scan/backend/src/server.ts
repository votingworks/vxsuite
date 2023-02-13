import { Logger, LogEventId, LogSource } from '@votingworks/logging';
import { createClient } from '@votingworks/plustek-scanner';
import { getUsbDrives } from '@votingworks/backend';
import { InsertedSmartCardAuthWithMemoryCard } from '@votingworks/auth';
import { WebServiceCard } from '@votingworks/utils';
import { PORT, SCAN_WORKSPACE } from './globals';
import { createWorkspace, Workspace } from './util/workspace';
import {
  CreatePlustekClient,
  createPrecinctScannerStateMachine,
} from './state_machine';
import { buildApp } from './app';
import { createInterpreter } from './interpret';
import { Usb } from './util/usb';

export interface StartOptions {
  port: number | string;
  createPlustekClient: CreatePlustekClient;
  logger: Logger;
  workspace: Workspace;
}

/**
 * Starts the server with all the default options.
 */
export async function start({
  port = PORT,
  createPlustekClient = createClient,
  logger = new Logger(LogSource.VxScanBackend),
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

  const auth = new InsertedSmartCardAuthWithMemoryCard({
    card: new WebServiceCard({ baseUrl: 'http://localhost:3001' }),
    config: {
      allowedUserRoles: [
        'system_administrator',
        'election_manager',
        'poll_worker',
      ],
    },
  });
  const precinctScannerInterpreter = createInterpreter();
  const precinctScannerMachine = createPrecinctScannerStateMachine({
    createPlustekClient,
    workspace: resolvedWorkspace,
    interpreter: precinctScannerInterpreter,
    logger,
  });
  const usb: Usb = { getUsbDrives };
  const app = buildApp(
    auth,
    precinctScannerMachine,
    precinctScannerInterpreter,
    resolvedWorkspace,
    usb,
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
    }
  });
}
