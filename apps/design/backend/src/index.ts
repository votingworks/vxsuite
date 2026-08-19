/* istanbul ignore file */

import { fileURLToPath } from 'node:url';
import './configure_sentry.js'; // Must be imported first to instrument code
import { resolve } from 'node:path';
import { loadEnvVarsFromDotenvFiles } from '@votingworks/backend';
import { throwIllegalValue } from '@votingworks/basics';
import { BaseLogger, Logger, LogSource } from '@votingworks/logging';
import { authMode, WORKSPACE } from './globals.js';
import * as server from './server.js';
import { createWorkspace } from './workspace.js';
import { Store } from './store.js';
import { GoogleCloudTranslatorWithDbCache } from './translator.js';
import { GoogleCloudSpeechSynthesizerWithDbCache } from './speech_synthesizer.js';
import { Auth0Client } from './auth0_client.js';
import { Auth0AuthClient, AuthClient } from './auth.js';
import { SmartCardAuthClient } from './smart_card_auth.js';
import {
  LocalFileStorageClient,
  S3FileStorageClient,
} from './file_storage_client.js';

export type { TtsStringDefault } from './tts_strings.js';
export type {
  BackgroundTask,
  DuplicateDistrictError,
  DuplicatePartyError,
  ElectionRecord,
  MainExportTaskMetadata,
  SetPollingPlaceError,
  TestDecksTaskMetadata,
} from './store.js';
export type {
  User,
  JurisdictionUser,
  OrganizationUser,
  SupportUser,
  Jurisdiction,
  Organization,
  ElectionStatus,
  ElectionListing,
  ElectionInfo,
  ElectionUpload,
  AggregatedReportedResults,
  ReceivedReportInfo,
  QuickReportedPollStatus,
  GetExportedElectionError,
  ResultsReportingPath,
  ExportQaRun,
  ExportQaStatus,
} from './types.js';
export type {
  StateFeature,
  StateFeaturesConfig,
  UserFeature,
  UserFeaturesConfig,
} from './features.js';
export type {
  Api,
  AuthErrorCode,
  SmartCardAuthApi,
  UnauthenticatedApi,
} from './app.js';
export type { ConvertMsResultsError } from './convert_ms_results.js';

export type { BallotTemplateId } from '@votingworks/hmpb';

// Frontend tests import these for generating test data
export { createBlankElection } from './app.js';

loadEnvVarsFromDotenvFiles();

function createAuthClient(store: Store, baseLogger: BaseLogger): AuthClient {
  const mode = authMode();
  switch (mode) {
    case 'auth0':
      return new Auth0AuthClient(Auth0Client.init(), store);
    case 'smart-card':
      return SmartCardAuthClient.init(baseLogger);
    case 'none':
      return new Auth0AuthClient(Auth0Client.dev(), store);
    default:
      return throwIllegalValue(mode);
  }
}

async function main(): Promise<number> {
  if (!WORKSPACE) {
    throw new Error(
      'Workspace path could not be determined; pass a workspace or run with WORKSPACE'
    );
  }
  const workspacePath = resolve(WORKSPACE);
  const baseLogger = new BaseLogger(LogSource.VxDesignService);
  const workspace = createWorkspace(workspacePath, baseLogger);
  const { store } = workspace;

  const auth = createAuthClient(store, baseLogger);

  // We reuse the VxSuite logging library, but it doesn't matter if we meet VVSG
  // requirements in VxDesign, so we can use it a bit loosely. For example, the
  // VxSuite user roles don't match VxDesign's user roles and the "current user"
  // isn't known outside of an API request, so we just log as "system".
  const logger = Logger.from(baseLogger, () => Promise.resolve('system'));

  const fileStorageClient =
    process.env.NODE_ENV === 'production'
      ? new S3FileStorageClient()
      : new LocalFileStorageClient();

  const speechSynthesizer = new GoogleCloudSpeechSynthesizerWithDbCache({
    store,
  });
  const translator = new GoogleCloudTranslatorWithDbCache({ store });

  server.start({
    auth,
    fileStorageClient,
    logger,
    speechSynthesizer,
    translator,
    workspace,
  });
  return Promise.resolve(0);
}

// ESM has no `require.main`/`module`, so compare this module's path to the entry
// point node was given — `process.argv[1]`, which node resolves to an absolute
// path even when invoked relatively (`node ./build/index.js`, as start.sh does).
if (process.argv[1] === fileURLToPath(import.meta.url)) {
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
