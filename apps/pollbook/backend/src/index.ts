/* istanbul ignore file - @preserve */

import { resolve } from 'node:path';
import { loadEnvVarsFromDotenvFiles } from '@votingworks/backend';
import { BaseLogger, Logger, LogSource } from '@votingworks/logging';
import { detectUsbDrive } from '@votingworks/usb-drive';
import {
  isFeatureFlagEnabled,
  BooleanEnvironmentVariableName,
  isIntegrationTest,
} from '@votingworks/utils';
import { DippedSmartCardAuth, MockFileCard, JavaCard } from '@votingworks/auth';
import { detectPrinter } from '@votingworks/printing';
import { WORKSPACE } from './globals';
import * as localServer from './server';
import * as peerServer from './peer_server';
import * as backupWorker from './backup_worker';
import { createLocalWorkspace, createPeerWorkspace } from './workspace';
import { AvahiService } from './avahi';

export type { LocalApi as Api } from './app';
export * from './types';

loadEnvVarsFromDotenvFiles();

function main(): Promise<number> {
  const baseLogger = new BaseLogger(LogSource.System);

  if (!WORKSPACE) {
    throw new Error(
      'Workspace path could not be determined; pass a workspace or run with WORKSPACE'
    );
  }
  const workspacePath = resolve(WORKSPACE);

  const auth = new DippedSmartCardAuth({
    card:
      isFeatureFlagEnabled(BooleanEnvironmentVariableName.USE_MOCK_CARDS) ||
      isIntegrationTest()
        ? new MockFileCard()
        : new JavaCard(),
    config: {
      allowElectionManagersToAccessUnconfiguredMachines: true,
      allowedUserRoles: [
        'system_administrator',
        'election_manager',
        'poll_worker',
        'vendor',
      ],
    },
    logger: baseLogger,
  });
  const machineId = process.env.VX_MACHINE_ID || 'dev';
  const codeVersion = process.env.VX_CODE_VERSION || 'dev';

  const logger = Logger.from(baseLogger, () => Promise.resolve('system'));
  const usbDrive = detectUsbDrive(logger);
  const printer = detectPrinter(logger);
  const peerWorkspace = createPeerWorkspace(
    workspacePath,
    baseLogger,
    machineId,
    codeVersion
  );
  const peerPort = peerServer.start({
    workspace: peerWorkspace,
    machineId,
    codeVersion,
    auth,
  });

  const localWorkspace = createLocalWorkspace(
    workspacePath,
    baseLogger,
    peerPort,
    machineId,
    codeVersion
  );
  localServer.start({
    workspace: localWorkspace,
    auth,
    usbDrive,
    printer,
    machineId,
    codeVersion,
  });
  backupWorker.start({ workspace: localWorkspace, usbDrive });

  return Promise.resolve(0);
}

// Ensure the running process is killed when the server is killed
process.on('exit', () => {
  AvahiService.stopAdvertisedService();
});

// Optionally handle other termination signals
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    AvahiService.stopAdvertisedService();
    process.exit();
  });
}
process.on('unhandledRejection', (reason) => {
  // eslint-disable-next-line no-console
  console.error('Unhandled Promise Rejection:', reason);
});

if (require.main === module) {
  void main()
    .catch((error) => {
      // eslint-disable-next-line no-console
      console.error(`Error starting VxPollBook backend: ${error.stack}`);
      return 1;
    })
    .then((code) => {
      process.exitCode = code;
    });
}
