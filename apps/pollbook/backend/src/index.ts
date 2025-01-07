/* istanbul ignore file */

import { resolve } from 'node:path';
import { loadEnvVarsFromDotenvFiles } from '@votingworks/backend';
import { BaseLogger, LogSource } from '@votingworks/logging';
import { WORKSPACE } from './globals';
import * as server from './server';
import { createWorkspace } from './workspace';

export type * from './app';

loadEnvVarsFromDotenvFiles();

function main(): Promise<number> {
  if (!WORKSPACE) {
    throw new Error(
      'Workspace path could not be determined; pass a workspace or run with WORKSPACE'
    );
  }
  const workspacePath = resolve(WORKSPACE);
  const workspace = createWorkspace(
    workspacePath,
    new BaseLogger(LogSource.System)
  );

  server.start({ workspace });
  return Promise.resolve(0);
}

if (require.main === module) {
  void main()
    .catch((error) => {
      // eslint-disable-next-line no-console
      console.error(`Error starting VxPollbook backend: ${error.stack}`);
      return 1;
    })
    .then((code) => {
      process.exitCode = code;
    });
}
