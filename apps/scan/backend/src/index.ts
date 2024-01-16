import * as customScanner from '@votingworks/custom-scanner';
import { LogEventId, Logger, LogSource } from '@votingworks/logging';
import { detectUsbDrive } from '@votingworks/usb-drive';
import {
  InsertedSmartCardAuth,
  JavaCard,
  MockFileCard,
} from '@votingworks/auth';
import {
  BooleanEnvironmentVariableName,
  isFeatureFlagEnabled,
  isIntegrationTest,
} from '@votingworks/utils';
import { loadEnvVarsFromDotenvFiles } from '@votingworks/backend';
import { detectPrinter } from '@votingworks/printing';
import { SCAN_WORKSPACE } from './globals';
import * as customStateMachine from './scanners/custom/state_machine';
import * as server from './server';
import { createWorkspace, Workspace } from './util/workspace';

export type { Api } from './app';
export * from './types';

loadEnvVarsFromDotenvFiles();

const logger = new Logger(LogSource.VxScanBackend);

async function resolveWorkspace(): Promise<Workspace> {
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
  return createWorkspace(workspacePath);
}

async function main(): Promise<number> {
  const auth = new InsertedSmartCardAuth({
    card:
      isFeatureFlagEnabled(BooleanEnvironmentVariableName.USE_MOCK_CARDS) ||
      isIntegrationTest()
        ? new MockFileCard()
        : new JavaCard(),
    config: {},
    logger,
  });
  const workspace = await resolveWorkspace();
  const usbDrive = detectUsbDrive(logger);
  const printer = detectPrinter(logger);

  const precinctScannerStateMachine =
    customStateMachine.createPrecinctScannerStateMachine({
      createCustomClient: customScanner.openScanner,
      auth,
      workspace,
      logger,
      usbDrive,
    });

  server.start({
    auth,
    precinctScannerStateMachine,
    workspace,
    usbDrive,
    printer,
    logger,
  });

  return 0;
}

if (require.main === module) {
  void main()
    .catch((error) => {
      void logger.log(LogEventId.ApplicationStartup, 'system', {
        message: `Error in starting VxScan backend: ${error.stack}`,
        disposition: 'failure',
      });
      return 1;
    })
    .then((code) => {
      process.exitCode = code;
    });
}
