import {
  handleUncaughtExceptions,
  loadEnvVarsFromDotenvFiles,
  TaskController,
} from '@votingworks/backend';
import {
  BaseLogger,
  LogEventId,
  Logger,
  LogSource,
} from '@votingworks/logging';
import { detectUsbDrive } from '@votingworks/usb-drive';
import {
  BooleanEnvironmentVariableName,
  isFeatureFlagEnabled,
} from '@votingworks/utils';
import { startElectricalTestingServer } from './electrical_testing/server';
import { MARK_SCAN_WORKSPACE, PORT } from './globals';
import * as server from './server';
import { getDefaultAuth, getUserRole } from './util/auth';
import { createWorkspace, Workspace } from './util/workspace';

export type { Api, MockPaperHandlerStatus } from './app';
export * from './custom-paper-handler';
export type { ElectricalTestingApi } from './electrical_testing/app';
export * from './types';

loadEnvVarsFromDotenvFiles();

const baseLogger = new BaseLogger(LogSource.VxMarkScanBackend);

function resolveWorkspace(): Workspace {
  const workspacePath = MARK_SCAN_WORKSPACE;
  if (!workspacePath) {
    baseLogger.log(LogEventId.WorkspaceConfigurationMessage, 'system', {
      message:
        'workspace path could not be determined; pass a workspace or run with MARK_SCAN_WORKSPACE',
      disposition: 'failure',
    });
    throw new Error(
      'workspace path could not be determined; pass a workspace or run with MARK_SCAN_WORKSPACE'
    );
  }
  return createWorkspace(workspacePath, baseLogger);
}

async function main(): Promise<number> {
  handleUncaughtExceptions(baseLogger);

  const workspace = resolveWorkspace();

  if (
    isFeatureFlagEnabled(
      BooleanEnvironmentVariableName.ENABLE_ELECTRICAL_TESTING_MODE
    )
  ) {
    const auth = getDefaultAuth(baseLogger);
    const logger = Logger.from(baseLogger, () => getUserRole(auth, workspace));
    const usbDrive = detectUsbDrive(logger);
    startElectricalTestingServer({
      auth,
      cardTask: TaskController.started(),
      paperHandlerTask: TaskController.started(),
      usbDriveTask: TaskController.started(),
      usbDrive,
      logger,
      workspace,
    });
    return 0;
  }

  await server.start({ port: PORT, logger: baseLogger, workspace });
  return 0;
}

if (require.main === module) {
  void main()
    .catch((error) => {
      baseLogger.log(LogEventId.ApplicationStartup, 'system', {
        message: `Error in starting VxMarkScan backend: ${
          (error as Error).stack
        }`,
        disposition: 'failure',
      });
      return 1;
    })
    .then((code) => {
      process.exitCode = code;
    });
}
