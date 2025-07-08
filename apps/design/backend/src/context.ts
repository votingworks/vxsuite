import { Logger } from '@votingworks/logging';
import { Auth0ClientInterface } from './auth0_client';
import { FileStorageClient } from './file_storage_client';
import { GoogleCloudSpeechSynthesizerWithDbCache } from './speech_synthesizer';
import { GoogleCloudTranslatorWithDbCache } from './translator';
import { Workspace } from './workspace';

export interface AppContext {
  auth0: Auth0ClientInterface;
  fileStorageClient: FileStorageClient;
  speechSynthesizer: GoogleCloudSpeechSynthesizerWithDbCache;
  translator: GoogleCloudTranslatorWithDbCache;
  workspace: Workspace;
  logger: Logger;
}
