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

/* istanbul ignore next - @preserve */
async function main(): Promise<void> {
  const workspacePath = path.resolve(assertDefined(WORKSPACE));
  const logger = new BaseLogger(LogSource.VxDesignWorker);
  const workspace = createWorkspace(workspacePath, logger);
  const { store } = workspace;

  const fileStorageClient =
    process.env.NODE_ENV === 'production'
      ? new S3FileStorageClient()
      : new LocalFileStorageClient();

  const speechSynthesizer = new GoogleCloudSpeechSynthesizerWithDbCache({
    store,
  });
  const translator = new GoogleCloudTranslatorWithDbCache({ store });

  process.stdout.write('VxDesign background worker running\n');
  await worker.start({
    fileStorageClient,
    speechSynthesizer,
    translator,
    workspace,
    logger,
  });
}

/* istanbul ignore next - @preserve */
if (require.main === module) {
  main()
    .catch((error) => {
      process.stderr.write(
        `Error starting VxDesign background worker:\n${error.stack}\n`
      );
      process.exitCode = 1;
    });
}
