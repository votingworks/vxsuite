import path from 'node:path';
import { loadEnvVarsFromDotenvFiles } from '@votingworks/backend';
import { assertDefined } from '@votingworks/basics';

import { BaseLogger, LogSource } from '@votingworks/logging';
import { WORKSPACE } from '../globals';
import { createWorkspace } from '../workspace';
import * as worker from './worker';
import { GoogleCloudTranslatorWithDbCache } from '../translator';
import { GoogleCloudSpeechSynthesizerWithDbCache } from '../speech_synthesizer';

loadEnvVarsFromDotenvFiles();

async function main(): Promise<void> {
  const workspacePath = path.resolve(assertDefined(WORKSPACE));
  const workspace = createWorkspace(
    workspacePath,
    new BaseLogger(LogSource.VxDesignWorker)
  );
  const { store } = workspace;
  const speechSynthesizer = new GoogleCloudSpeechSynthesizerWithDbCache({
    store,
  });
  const translator = new GoogleCloudTranslatorWithDbCache({ store });

  await worker.start({ speechSynthesizer, translator, workspace });
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
