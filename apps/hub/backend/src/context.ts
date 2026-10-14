import type { Logger } from '@votingworks/logging';
import type { Auth0ClientInterface } from './auth0_client.js';
import type { FileStorageClient } from './file_storage_client.js';
import type { GoogleCloudSpeechSynthesizerWithDbCache } from './speech_synthesizer.js';
import type { GoogleCloudTranslatorWithDbCache } from './translator.js';
import type { Workspace } from './workspace.js';

export interface AppContext {
  auth0: Auth0ClientInterface;
  fileStorageClient: FileStorageClient;
  speechSynthesizer: GoogleCloudSpeechSynthesizerWithDbCache;
  translator: GoogleCloudTranslatorWithDbCache;
  workspace: Workspace;
  logger: Logger;
}
