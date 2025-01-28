/* istanbul ignore file - @preserve */
import { resolve } from 'node:path';
import { S3Client } from '@aws-sdk/client-s3';
import { loadEnvVarsFromDotenvFiles } from '@votingworks/backend';
import { BaseLogger, LogSource } from '@votingworks/logging';

import { WORKSPACE } from './globals';
import * as server from './server';
import { GoogleCloudSpeechSynthesizerWithDbCache } from './speech_synthesizer';
import { GoogleCloudTranslatorWithDbCache } from './translator';
import { createWorkspace } from './workspace';

export type { ElectionRecord } from './store';
export type {
  BallotOrderInfo,
  BallotStyle,
  Precinct,
  PrecinctSplit,
  PrecinctWithSplits,
  PrecinctWithoutSplits,
} from './types';
export type { Api } from './app';
export type { BallotMode } from '@votingworks/hmpb';
export type { BallotTemplateId } from '@votingworks/hmpb';

// Frontend tests import these for generating test data
export { generateBallotStyles } from './ballot_styles';
export { createBlankElection, convertVxfPrecincts } from './app';

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
    new BaseLogger(LogSource.VxDesignService)
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

  server.start({ s3Client, speechSynthesizer, translator, workspace });
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
