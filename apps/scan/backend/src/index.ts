import { assert } from '@votingworks/basics';
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
  TaskController,
} from '@votingworks/backend';
import { SCAN_WORKSPACE } from './globals';
import * as server from './server';
import { startElectricalTestingServer } from './electrical_testing/server';
import { createWorkspace, Workspace } from './util/workspace';
import { getUserRole } from './util/auth';
import { getPrinter } from './printing/printer';
import { createSimpleScannerClient } from './electrical_testing/simple_scanner_client';

export type { Api } from './app';
export type { ElectricalTestingApi } from './electrical_testing/app';
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

function resolveWorkspace(): Workspace {
  const workspacePath = SCAN_WORKSPACE;
  if (!workspacePath) {
    baseLogger.log(LogEventId.WorkspaceConfigurationMessage, 'system', {
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

function main(): number {
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
  const workspace = resolveWorkspace();
  const logger = Logger.from(baseLogger, () => getUserRole(auth, workspace));
  const usbDrive = detectUsbDrive(logger);
  const printer = getPrinter(logger);

  if (
    isFeatureFlagEnabled(
      BooleanEnvironmentVariableName.ENABLE_ELECTRICAL_TESTING_MODE
    )
  ) {
    startElectricalTestingServer({
      auth,
      cardTask: TaskController.started<string>(),
      usbDriveTask: TaskController.started<string>(),
      printerTask: TaskController.started<string>(),
      scannerTask: TaskController.started<string>(),
      logger,
      printer,
      scannerClient: createSimpleScannerClient(),
      usbDrive,
      workspace,
    });
    return 0;
  }

  server.start({
    auth,
    workspace,
    usbDrive,
    printer,
    logger,
  });
  return 0;
}

if (require.main === module) {
  try {
    process.exitCode = main();
  } catch (error) {
    assert(error instanceof Error);
    baseLogger.log(LogEventId.ApplicationStartup, 'system', {
      message: `Error in starting VxScan backend: ${error.stack}`,
      disposition: 'failure',
    });
    process.exitCode = 1;
  }
}
