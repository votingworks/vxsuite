import * as customScanner from '@votingworks/custom-scanner';
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
import {
  handleUncaughtExceptions,
  loadEnvVarsFromDotenvFiles,
} from '@votingworks/backend';
import { createPdiScannerClient } from '@votingworks/pdi-scanner';
import { SCAN_WORKSPACE } from './globals';
import * as customStateMachine from './scanners/custom/state_machine';
import * as pdiStateMachine from './scanners/pdi/state_machine';
import * as server from './server';
import { createWorkspace, Workspace } from './util/workspace';
import { getUserRole } from './util/auth';
import { getPrinter } from './printing/printer';

export type { Api } from './app';
export type {
  PrinterStatus,
  PrintResult,
  FujitsuErrorType,
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
  return createWorkspace(workspacePath, baseLogger);
}

async function main(): Promise<number> {
  handleUncaughtExceptions(baseLogger);

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
  const printer = getPrinter(logger);

  const precinctScannerStateMachine = isFeatureFlagEnabled(
    BooleanEnvironmentVariableName.USE_CUSTOM_SCANNER
  )
    ? customStateMachine.createPrecinctScannerStateMachine({
        createCustomClient: customScanner.openScanner,
        auth,
        workspace,
        logger,
        usbDrive,
      })
    : pdiStateMachine.createPrecinctScannerStateMachine({
        createScannerClient: createPdiScannerClient,
        workspace,
        usbDrive,
        auth,
        logger,
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
