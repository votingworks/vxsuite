import { fileURLToPath } from 'node:url';
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
import { getFujitsuThermalPrinter } from '@votingworks/fujitsu-thermal-printer';
import { SCAN_WORKSPACE } from './globals.js';
import * as server from './server.js';
import { startElectricalTestingServer } from './electrical_testing/server.js';
import { createWorkspace, Workspace } from './util/workspace.js';
import { getUserRole } from './util/auth.js';
import { createSimpleScannerClient } from './electrical_testing/simple_scanner_client.js';
import { ScanningSession } from './electrical_testing/analysis/scan.js';

export type { Api } from './app.js';
export type * as HWTA from './electrical_testing/exports.js';
export type { OpenPollsResult } from './polls.js';
export type { SoundName } from './audio/player.js';
export * from './types.js';

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
  const workspace = resolveWorkspace();
  const logger = Logger.from(baseLogger, () => getUserRole(auth, workspace));
  const usbDrive = detectUsbDrive(logger);
  const printer = getFujitsuThermalPrinter(logger);

  if (
    isFeatureFlagEnabled(
      BooleanEnvironmentVariableName.ENABLE_HARDWARE_TEST_APP
    )
  ) {
    await startElectricalTestingServer({
      auth,
      cardTask: TaskController.started(),
      usbDriveTask: TaskController.started(),
      printerTask: TaskController.started({ lastPrintedAt: undefined }),
      scannerTask: TaskController.started({
        mode: 'shoe-shine',
        session: new ScanningSession(),
      }),
      logger,
      printer,
      scannerClient: createSimpleScannerClient(),
      usbDrive,
      workspace,
    });
    return 0;
  }

  await server.start({
    auth,
    workspace,
    usbDrive,
    printer,
    logger,
  });
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      assert(error instanceof Error);
      baseLogger.log(LogEventId.ApplicationStartup, 'system', {
        message: `Error in starting VxScan backend: ${error.stack}`,
        disposition: 'failure',
      });
      process.exitCode = 1;
    });
}
