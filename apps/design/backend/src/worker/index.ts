import path from 'path';
import { assertDefined } from '@votingworks/basics';

import { WORKSPACE } from '../globals';
import * as worker from './worker';
import { createWorkspace } from '../workspace';

async function main(): Promise<void> {
  const workspacePath = path.resolve(assertDefined(WORKSPACE));
  const workspace = createWorkspace(workspacePath);
  worker.start({ workspace });
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
