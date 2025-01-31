import '../configure_sentry'; // Must be imported first to instrument code

import path from 'node:path';
import { loadEnvVarsFromDotenvFiles } from '@votingworks/backend';
import { assertDefined } from '@votingworks/basics';
import { BaseLogger, LogSource } from '@votingworks/logging';

import { WORKSPACE } from '../globals';
import { createWorkspace } from '../workspace';
import * as worker from './worker';
import { GoogleCloudSpeechSynthesizerWithDbCache } from '../speech_synthesizer';
import { GoogleCloudTranslatorWithDbCache } from '../translator';
import {
  LocalFileStorageClient,
  S3FileStorageClient,
} from '../file_storage_client';

loadEnvVarsFromDotenvFiles();

async function main(): Promise<void> {
  const workspacePath = path.resolve(assertDefined(WORKSPACE));
  const workspace = createWorkspace(
    workspacePath,
    new BaseLogger(LogSource.VxDesignWorker)
  );
  const { store } = workspace;

  const fileStorageClient =
    process.env.NODE_ENV === 'production'
      ? new S3FileStorageClient()
      : new LocalFileStorageClient();

  const speechSynthesizer = new GoogleCloudSpeechSynthesizerWithDbCache({
    store,
  });
  const translator = new GoogleCloudTranslatorWithDbCache({ store });

  await worker.start({
    fileStorageClient,
    speechSynthesizer,
    translator,
    workspace,
  });
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
