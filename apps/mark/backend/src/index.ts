import {
  BaseLogger,
  LogSource,
  LogEventId,
  Logger,
} from '@votingworks/logging';
import {
  handleUncaughtExceptions,
  loadEnvVarsFromDotenvFiles,
  TaskController,
} from '@votingworks/backend';
import { detectUsbDrive } from '@votingworks/usb-drive';
import { detectPrinter } from '@votingworks/printing';
import {
  BooleanEnvironmentVariableName,
  isFeatureFlagEnabled,
} from '@votingworks/utils';
import * as server from './server';
import { MARK_WORKSPACE, PORT } from './globals';
import { createWorkspace, Workspace } from './util/workspace';
import { startElectricalTestingServer } from './electrical_testing/server';
import { getDefaultAuth, getUserRole } from './util/auth';
import { Client as BarcodeClient } from './barcodes';

export type { Api } from './app';
export type { PrintCalibration } from '@votingworks/hmpb';
export type {
  ElectricalTestingApi,
  BarcodeStatus,
} from './electrical_testing/app';
export * from './types';

loadEnvVarsFromDotenvFiles();

const baseLogger = new BaseLogger(LogSource.VxMarkBackend);

function resolveWorkspace(): Workspace {
  const workspacePath = MARK_WORKSPACE;
  if (!workspacePath) {
    baseLogger.log(LogEventId.WorkspaceConfigurationMessage, 'system', {
      message:
        'workspace path could not be determined; pass a workspace or run with MARK_WORKSPACE',
      disposition: 'failure',
    });
    throw new Error(
      'workspace path could not be determined; pass a workspace or run with MARK_WORKSPACE'
    );
  }
  return createWorkspace(workspacePath, baseLogger);
}

function main(): number {
  handleUncaughtExceptions(baseLogger);

  const workspace = resolveWorkspace();

  if (
    isFeatureFlagEnabled(
      BooleanEnvironmentVariableName.ENABLE_HARDWARE_TEST_APP
    )
  ) {
    const auth = getDefaultAuth(baseLogger);
    const logger = Logger.from(baseLogger, () => getUserRole(auth, workspace));
    const usbDrive = detectUsbDrive(logger);
    const printer = detectPrinter(logger);
    const barcodeClient = new BarcodeClient(baseLogger);
    startElectricalTestingServer({
      auth,
      cardTask: TaskController.started(),
      usbDriveTask: TaskController.started(),
      printerTask: TaskController.started(),
      usbDrive,
      logger,
      workspace,
      printer,
      barcodeClient,
    });
    return 0;
  }

  server.start({ port: PORT, baseLogger, workspace });
  return 0;
}

if (require.main === module) {
  try {
    process.exitCode = main();
  } catch (error) {
    void baseLogger.log(LogEventId.ApplicationStartup, 'system', {
      message: `Error in starting VxMark backend: ${(error as Error).stack}`,
      disposition: 'failure',
    });
    process.exitCode = 1;
  }
}
