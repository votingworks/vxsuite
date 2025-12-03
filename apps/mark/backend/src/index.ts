import { BaseLogger, LogSource, LogEventId } from '@votingworks/logging';
import {
  handleUncaughtExceptions,
  loadEnvVarsFromDotenvFiles,
} from '@votingworks/backend';
import * as server from './server';
import { MARK_WORKSPACE, PORT } from './globals';
import { createWorkspace, Workspace } from './util/workspace';

export type { Api } from './app';
export type { PrintCalibration } from '@votingworks/hmpb';
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
