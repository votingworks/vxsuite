import { Buffer } from 'buffer';
import * as customScanner from '@votingworks/custom-scanner';
import * as pdi from '@votingworks/pdi-rs';
import {
  BaseLogger,
  LogEventId,
  Logger,
  LogSource,
} from '@votingworks/logging';
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
import { SCAN_WORKSPACE } from './globals';
import * as customStateMachine from './scanners/custom/state_machine';
import * as server from './server';
import { createWorkspace, Workspace } from './util/workspace';
import { getUserRole } from './util/auth';
import { getPrinter } from './printing/printer';

export type { Api } from './app';
export type {
  PrinterStatus,
  PrintResult,
  FujitsuPrinterState,
  FujitsuPrinterStatus,
  FujitsuPrintResult,
} from './printing/printer';
export type { OpenPollsResult } from './polls';
export * from './types';

loadEnvVarsFromDotenvFiles();

const baseLogger = new BaseLogger(LogSource.VxScanBackend);

async function resolveWorkspace(): Promise<Workspace> {
  const workspacePath = SCAN_WORKSPACE;
  if (!workspacePath) {
    await baseLogger.log(LogEventId.ScanServiceConfigurationMessage, 'system', {
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
    logger: baseLogger,
  });
  const workspace = await resolveWorkspace();
  const logger = Logger.from(baseLogger, () => getUserRole(auth, workspace));
  const usbDrive = detectUsbDrive(logger);
  const printer = await getPrinter(logger);

  const precinctScannerStateMachine =
    pdiStateMachine.createPrecinctScannerStateMachine({
      createCustomClient: openPdiScanner,
      auth,
      workspace,
      logger,
      usbDrive,
    });

  await server.start({
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
      void baseLogger.log(LogEventId.ApplicationStartup, 'system', {
        message: `Error in starting VxScan backend: ${error.stack}`,
        disposition: 'failure',
      });
      return 1;
    })
    .then((code) => {
      process.exitCode = code;
    });
}
