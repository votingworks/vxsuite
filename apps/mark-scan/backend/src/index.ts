import { BaseLogger, LogSource, LogEventId } from '@votingworks/logging';
import {
  handleUncaughtExceptions,
  loadEnvVarsFromDotenvFiles,
} from '@votingworks/backend';
import * as server from './server';
import { MARK_SCAN_WORKSPACE, PORT } from './globals';
import { createWorkspace, Workspace } from './util/workspace';

export type { Api, MockPaperHandlerStatus } from './app';
export * from './types';
export * from './custom-paper-handler';

loadEnvVarsFromDotenvFiles();

const logger = new BaseLogger(LogSource.VxMarkScanBackend);

async function resolveWorkspace(): Promise<Workspace> {
  const workspacePath = MARK_SCAN_WORKSPACE;
  if (!workspacePath) {
    await logger.log(LogEventId.ScanServiceConfigurationMessage, 'system', {
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

  const workspace = await resolveWorkspace();
  await server.start({ port: PORT, logger, workspace });
  return 0;
}

if (require.main === module) {
  void main()
    .catch((error) => {
      void logger.log(LogEventId.ApplicationStartup, 'system', {
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
