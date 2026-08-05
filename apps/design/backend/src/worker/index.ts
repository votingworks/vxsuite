import { fileURLToPath } from 'node:url';
import '../configure_sentry.js'; // Must be imported first to instrument code

import path from 'node:path';
import { loadEnvVarsFromDotenvFiles } from '@votingworks/backend';
import { assertDefined } from '@votingworks/basics';
import { BaseLogger, LogSource } from '@votingworks/logging';

import { WORKSPACE } from '../globals.js';
import { createWorkspace } from '../workspace.js';
import * as worker from './worker.js';
import { GoogleCloudSpeechSynthesizerWithDbCache } from '../speech_synthesizer.js';
import { GoogleCloudTranslatorWithDbCache } from '../translator.js';
import {
  LocalFileStorageClient,
  S3FileStorageClient,
} from '../file_storage_client.js';

loadEnvVarsFromDotenvFiles();

/* istanbul ignore next */
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

/* istanbul ignore next */
// ESM has no `require.main`/`module`, so compare this module's path to the entry
// point node was given — `process.argv[1]`, which node resolves to an absolute
// path even when invoked relatively (`node ./build/index.js`, as start.sh does).
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(
      `Error starting VxDesign background worker:\n${error.stack}\n`
    );
    process.exitCode = 1;
  });
}
