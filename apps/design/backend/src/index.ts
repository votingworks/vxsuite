import { resolve } from 'path';
import { loadEnvVarsFromDotenvFiles } from '@votingworks/backend';
import { WORKSPACE } from './globals';
import * as server from './server';
import { createWorkspace } from './workspace';
import {
  GoogleCloudSpeechSynthesizer,
  GoogleCloudTranslator,
} from './language_and_audio';

export type {
  BallotStyle,
  ElectionRecord,
  Precinct,
  PrecinctSplit,
  PrecinctWithSplits,
  PrecinctWithoutSplits,
} from './store';
export type { Api } from './app';

// Frontend tests import these for generating test data
export { generateBallotStyles } from './store';
export { createBlankElection, convertVxfPrecincts } from './app';

loadEnvVarsFromDotenvFiles();

function main(): Promise<number> {
  if (!WORKSPACE) {
    throw new Error(
      'Workspace path could not be determined; pass a workspace or run with WORKSPACE'
    );
  }
  const workspacePath = resolve(WORKSPACE);
  const workspace = createWorkspace(workspacePath);
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
