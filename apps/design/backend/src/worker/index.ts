import path from 'path';
import { loadEnvVarsFromDotenvFiles } from '@votingworks/backend';
import { assertDefined } from '@votingworks/basics';

import { WORKSPACE } from '../globals';
import {
  GoogleCloudSpeechSynthesizer,
  GoogleCloudTranslator,
} from '../language_and_audio';
import { createWorkspace } from '../workspace';
import * as worker from './worker';

loadEnvVarsFromDotenvFiles();

async function main(): Promise<void> {
  const workspacePath = path.resolve(assertDefined(WORKSPACE));
  const workspace = createWorkspace(workspacePath);
  const { store } = workspace;
  const speechSynthesizer = new GoogleCloudSpeechSynthesizer({ store });
  const translator = new GoogleCloudTranslator({ store });

  worker.start({ speechSynthesizer, translator, workspace });
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
