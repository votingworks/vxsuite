import { InsertedSmartCardAuth, MemoryCard } from '@votingworks/auth';
import { getUsbDrives } from '@votingworks/backend';
import { LogEventId, Logger, LogSource } from '@votingworks/logging';
import { buildApp } from './app';
import { PORT } from './globals';
import { PrecinctScannerInterpreter } from './interpret';
import { PrecinctScannerStateMachine } from './state_machine';
import { Usb } from './util/usb';
import { Workspace } from './util/workspace';

export interface StartOptions {
  precinctScannerStateMachine: PrecinctScannerStateMachine;
  precinctScannerInterpreter: PrecinctScannerInterpreter;
  workspace: Workspace;
  port?: number | string;
  logger?: Logger;
}

/**
 * Starts the server.
 */
export function start({
  precinctScannerStateMachine,
  precinctScannerInterpreter,
  workspace,
  logger = new Logger(LogSource.VxScanBackend),
}: StartOptions): void {
  // clear any cached data
  workspace.clearUploads();

  const auth = new InsertedSmartCardAuth({
    card: new MemoryCard({ baseUrl: 'http://localhost:3001' }),
    config: {
      allowedUserRoles: [
        'system_administrator',
        'election_manager',
        'poll_worker',
      ],
    },
    logger,
  });
  const usb: Usb = { getUsbDrives };
  const app = buildApp(
    auth,
    precinctScannerStateMachine,
    precinctScannerInterpreter,
    workspace,
    usb,
    logger
  );

  app.listen(PORT, async () => {
    await logger.log(LogEventId.ApplicationStartup, 'system', {
      message: `VxScan backend running at http://localhost:${PORT}/`,
      disposition: 'success',
    });

    await logger.log(LogEventId.ScanServiceConfigurationMessage, 'system', {
      message: `Scanning ballots into ${workspace.ballotImagesPath}`,
    });
  });
}
