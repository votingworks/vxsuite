import { BaseLogger, LogSource, LogEventId } from '@votingworks/logging';
import {
  handleUncaughtExceptions,
  loadEnvVarsFromDotenvFiles,
  TaskController,
} from '@votingworks/backend';
import {
  BooleanEnvironmentVariableName,
  isFeatureFlagEnabled,
} from '@votingworks/utils';
import * as server from './server';
import { MARK_SCAN_WORKSPACE, PORT } from './globals';
import { createWorkspace, Workspace } from './util/workspace';
import { startElectricalTestingServer } from './electrical_testing/server';
import { getDefaultAuth } from './util/auth';

export type { Api, MockPaperHandlerStatus } from './app';
export type { ElectricalTestingApi } from './electrical_testing/app';
export * from './types';
export * from './custom-paper-handler';

loadEnvVarsFromDotenvFiles();

const logger = new BaseLogger(LogSource.VxMarkScanBackend);

function resolveWorkspace(): Workspace {
  const workspacePath = MARK_SCAN_WORKSPACE;
  if (!workspacePath) {
    logger.log(LogEventId.WorkspaceConfigurationMessage, 'system', {
      message:
        'workspace path could not be determined; pass a workspace or run with MARK_SCAN_WORKSPACE',
      disposition: 'failure',
    });
    throw new Error(
      'workspace path could not be determined; pass a workspace or run with MARK_SCAN_WORKSPACE'
    );
  }
  return createWorkspace(workspacePath, logger);
}

async function main(): Promise<number> {
  handleUncaughtExceptions(logger);

  const workspace = resolveWorkspace();

  if (
    isFeatureFlagEnabled(
      BooleanEnvironmentVariableName.ENABLE_ELECTRICAL_TESTING_MODE
    )
  ) {
    startElectricalTestingServer({
      auth: getDefaultAuth(logger),
      cardTask: TaskController.started(),
      paperHandlerTask: TaskController.started(),
      logger,
      workspace,
    });
    return 0;
  }

  await server.start({ port: PORT, logger, workspace });
  return 0;
}

if (require.main === module) {
  void main()
    .catch((error) => {
      logger.log(LogEventId.ApplicationStartup, 'system', {
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
