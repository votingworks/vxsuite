import { join, resolve } from 'path';
import { ensureDirSync } from 'fs-extra';
import { WORKSPACE } from './globals';
import * as server from './server';
import { Store } from './store';

export type { Api } from './app';

function main(): Promise<number> {
  if (!WORKSPACE) {
    throw new Error(
      'Workspace path could not be determined; pass a workspace or run with WORKSPACE'
    );
  }
  const workspacePath = resolve(WORKSPACE);
  ensureDirSync(workspacePath);

  const dbPath = join(workspacePath, 'design-backend.db');
  const store = Store.fileStore(dbPath);

  server.start({ store });

  return Promise.resolve(0);
}

if (require.main === module) {
  void main()
    .catch((error) => {
      // eslint-disable-next-line no-console
      console.error(`Error starting VxDesign backend: ${error.stack}`);
      return 1;
    })
    .then((code) => {
      process.exitCode = code;
    });
}
