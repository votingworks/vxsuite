import { ensureDirSync } from 'fs-extra';
import path from 'path';
import { assertDefined } from '@votingworks/basics';

import { WORKSPACE } from '../globals';
import { Store } from '../store';
import * as worker from './worker';

async function main(): Promise<void> {
  const workspacePath = path.resolve(assertDefined(WORKSPACE));
  ensureDirSync(workspacePath);
  const dbPath = path.join(workspacePath, 'design-backend.db');
  const store = Store.fileStore(dbPath);
  worker.start({ store });
  return Promise.resolve();
}

if (require.main === module) {
  main()
    .then(() => {
      process.stdout.write('VxDesign background worker running\n');
      process.exitCode = 0;
    })
    .catch((error) => {
      process.stderr.write(
        `Error starting VxDesign background worker:\n${error.stack}\n`
      );
      process.exitCode = 1;
    });
}
