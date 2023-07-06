import { Logger, LogSource, LogEventId } from '@votingworks/logging';
import fs from 'fs';
import * as dotenv from 'dotenv';
import * as dotenvExpand from 'dotenv-expand';
import * as server from './server';
import { MARK_WORKSPACE, NODE_ENV, PORT } from './globals';
import { createWorkspace, Workspace } from './util/workspace';
import { getPaperHandlerStateMachine } from './custom-paper-handler/state_machine';

export type { Api } from './app';
export * from './types';
export * from './custom-paper-handler';

// https://github.com/bkeepers/dotenv#what-other-env-files-can-i-use
const dotEnvPath = '.env';
const dotenvFiles: string[] = [
  `${dotEnvPath}.${NODE_ENV}.local`,
  // Don't include `.env.local` for `test` environment
  // since normally you expect tests to produce the same
  // results for everyone
  NODE_ENV !== 'test' ? `${dotEnvPath}.local` : '',
  `${dotEnvPath}.${NODE_ENV}`,
  dotEnvPath,
  NODE_ENV !== 'test' ? `../../../${dotEnvPath}.local` : '',
  `../../../${dotEnvPath}`,
].filter(Boolean);

// Load environment variables from .env* files. Suppress warnings using silent
// if this file is missing. dotenv will never modify any environment variables
// that have already been set.  Variable expansion is supported in .env files.
// https://github.com/motdotla/dotenv
// https://github.com/motdotla/dotenv-expand
for (const dotenvFile of dotenvFiles) {
  if (fs.existsSync(dotenvFile)) {
    dotenvExpand.expand(dotenv.config({ path: dotenvFile }));
  }
}

const logger = new Logger(LogSource.VxMarkScanBackend);

async function resolveWorkspace(): Promise<Workspace> {
  const workspacePath = MARK_WORKSPACE;
  if (!workspacePath) {
    await logger.log(LogEventId.ScanServiceConfigurationMessage, 'system', {
      message:
        'workspace path could not be determined; pass a workspace or run with MARK_WORKSPACE',
      disposition: 'failure',
    });
    throw new Error(
      'workspace path could not be determined; pass a workspace or run with MARK_WORKSPACE'
    );
  }
  return createWorkspace(workspacePath);
}

async function main(): Promise<number> {
  const workspace = await resolveWorkspace();
  const stateMachine = await getPaperHandlerStateMachine();
  server.start({ port: PORT, logger, workspace, stateMachine });
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
