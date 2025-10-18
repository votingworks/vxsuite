import { BaseLogger, LogSource, LogEventId } from '@votingworks/logging';
import {
  handleUncaughtExceptions,
  loadEnvVarsFromDotenvFiles,
} from '@votingworks/backend';
import { sleep } from '@votingworks/basics';
import * as server from './server';
import { WORKSPACE } from './globals';
import { createWorkspace, Workspace } from './util/workspace';

export type { Api } from './app';

loadEnvVarsFromDotenvFiles();

const baseLogger = new BaseLogger(LogSource.VxPrintBackend);

function resolveWorkspace(): Workspace {
  const workspacePath = WORKSPACE;
  if (!workspacePath) {
    baseLogger.log(LogEventId.WorkspaceConfigurationMessage, 'system', {
      message:
        'workspace path could not be determined; pass a workspace or run with BALLOT_ON_DEMAND_WORKSPACE',
      disposition: 'failure',
    });
    throw new Error(
      'workspace path could not be determined; pass a workspace or run with BALLOT_ON_DEMAND_WORKSPACE'
    );
  }
  return createWorkspace(workspacePath, baseLogger);
}

async function main(): Promise<number> {
  handleUncaughtExceptions(baseLogger);

  const workspace = resolveWorkspace();
  server.start({ baseLogger, workspace });

  // Placeholder to keep async signature. TODO figure out if we need async signature
  await sleep(100);

  return 0;
}

if (require.main === module) {
  void main()
    .catch((error) => {
      void baseLogger.log(LogEventId.ApplicationStartup, 'system', {
        message: `Error in starting VxPrint backend: ${(error as Error).stack}`,
        disposition: 'failure',
      });
      return 1;
    })
    .then((code) => {
      process.exitCode = code;
    });
}
