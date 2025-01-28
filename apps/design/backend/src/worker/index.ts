import path from 'node:path';
import { S3Client } from '@aws-sdk/client-s3';
import { loadEnvVarsFromDotenvFiles } from '@votingworks/backend';
import { assertDefined } from '@votingworks/basics';
import { BaseLogger, LogSource } from '@votingworks/logging';

import { WORKSPACE } from '../globals';
import { GoogleCloudSpeechSynthesizerWithDbCache } from '../speech_synthesizer';
import { GoogleCloudTranslatorWithDbCache } from '../translator';
import { createWorkspace } from '../workspace';
import * as worker from './worker';

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

  const s3Client =
    process.env.NODE_ENV !== 'production'
      ? new S3Client({ region: 'us-west-1' })
      : undefined;

  await worker.start({ s3Client, speechSynthesizer, translator, workspace });
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
