import { Result } from '@votingworks/basics';
import { Logger } from '@votingworks/logging';
import { Auth0ClientInterface } from './auth0_client.js';
import { FileStorageClient } from './file_storage_client.js';
import { GoogleCloudSpeechSynthesizerWithDbCache } from './speech_synthesizer.js';
import { GoogleCloudTranslatorWithDbCache } from './translator.js';
import { Workspace } from './workspace.js';

export interface AppContext {
  auth0: Auth0ClientInterface;
  fileStorageClient: FileStorageClient;
  speechSynthesizer: GoogleCloudSpeechSynthesizerWithDbCache;
  translator: GoogleCloudTranslatorWithDbCache;
  workspace: Workspace;
  logger: Logger;
  decryptAes256Override?: (key: string, data: string) => Promise<string>;
  authenticateSignedQuickResultsReportingUrlOverride?: (
    payload: string,
    signature: string,
    certificate: string
  ) => Promise<Result<void, 'invalid-signature'>>;
}
