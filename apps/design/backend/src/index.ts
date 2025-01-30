/* istanbul ignore file - @preserve */

import './configure_sentry'; // Must be imported first to instrument code
import { resolve } from 'node:path';
import { loadEnvVarsFromDotenvFiles } from '@votingworks/backend';
import { BaseLogger, LogSource } from '@votingworks/logging';
import { authEnabled, WORKSPACE } from './globals';
import * as server from './server';
import { createWorkspace } from './workspace';
import { GoogleCloudTranslatorWithDbCache } from './translator';
import { GoogleCloudSpeechSynthesizerWithDbCache } from './speech_synthesizer';
import { AuthClient } from './auth/client';

export type { ElectionRecord } from './store';
export type {
  BallotOrderInfo,
  BallotStyle,
  Precinct,
  PrecinctSplit,
  PrecinctWithSplits,
  PrecinctWithoutSplits,
  User,
} from './types';
export type { Api, ElectionInfo } from './app';
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

  const auth = authEnabled() ? AuthClient.init() : AuthClient.dev();

  server.start({ auth, speechSynthesizer, translator, workspace });
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
