/* istanbul ignore file */

import { resolve } from 'node:path';
import { loadEnvVarsFromDotenvFiles } from '@votingworks/backend';
import { BaseLogger, LogSource } from '@votingworks/logging';
import { WORKSPACE } from './globals';
import * as server from './server';
import { createWorkspace } from './workspace';
import {
  GoogleCloudSpeechSynthesizer,
  GoogleCloudTranslator,
} from './language_and_audio';

export type { ElectionRecord } from './store';
export type {
  BallotLanguageConfig,
  BallotLanguageConfigs,
  BallotStyle,
  Precinct,
  PrecinctSplit,
  PrecinctWithSplits,
  PrecinctWithoutSplits,
} from './types';
export type { Api } from './app';
export type { BallotMode } from '@votingworks/hmpb';

// Frontend tests import these for generating test data
export { generateBallotStyles } from './ballot_styles';
export { createBlankElection, convertVxfPrecincts } from './app';
export { LanguageCode } from './language_code';

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
  const speechSynthesizer = new GoogleCloudSpeechSynthesizer({ store });
  const translator = new GoogleCloudTranslator({ store });

  server.start({ speechSynthesizer, translator, workspace });
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
