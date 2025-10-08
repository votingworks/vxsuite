/* istanbul ignore file - @preserve */

import './configure_sentry'; // Must be imported first to instrument code
import { resolve } from 'node:path';
import { loadEnvVarsFromDotenvFiles } from '@votingworks/backend';
import { BaseLogger, Logger, LogSource } from '@votingworks/logging';
import { authEnabled, NODE_ENV, WORKSPACE } from './globals';
import * as server from './server';
import { createWorkspace } from './workspace';
import { GoogleCloudTranslatorWithDbCache } from './translator';
import { GoogleCloudSpeechSynthesizerWithDbCache } from './speech_synthesizer';
import { Auth0Client } from './auth0_client';
import {
  LocalFileStorageClient,
  S3FileStorageClient,
} from './file_storage_client';

export type { TtsStringDefault } from './tts_strings';
export type { ElectionRecord, BackgroundTask } from './store';
export type {
  BallotStyle,
  User,
  ElectionStatus,
  ElectionListing,
  ElectionInfo,
  AggregatedReportedResults,
} from './types';
export type { ElectionFeaturesConfig, UserFeaturesConfig } from './features';
export type { Api, AuthErrorCode, UnauthenticatedApi } from './app';

export type { BallotMode } from '@votingworks/hmpb';
export type { BallotTemplateId } from '@votingworks/hmpb';

// Frontend tests import these for generating test data
export { generateBallotStyles } from './ballot_styles';
export { createBlankElection } from './app';

loadEnvVarsFromDotenvFiles();

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

  const auth0 = authEnabled() ? Auth0Client.init() : Auth0Client.dev();
  // We want to sync organizations in all cases except when using a prod db
  // backup for local debugging, in which case auth should be disabled and there
  // will already be orgs in the db.
  if (authEnabled() || (await store.listOrganizations()).length === 0) {
    try {
      await store.syncOrganizationsCache(await auth0.allOrgs());
    } catch (error) {
      if (NODE_ENV === 'development') {
        // eslint-disable-next-line no-console
        console.warn(
          'Error syncing the auth organizations to the local database.',
          'Are you using a production database backup in development?',
          'If so, set AUTH_ENABLED=false and ORG_ID_VOTINGWORKS=<prod_Auth0_VX_org_id>.'
        );
      }
      throw error;
    }
  }

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
    auth0,
    fileStorageClient,
    logger,
    speechSynthesizer,
    translator,
    workspace,
  });
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
