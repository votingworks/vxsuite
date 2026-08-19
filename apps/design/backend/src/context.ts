import { Logger } from '@votingworks/logging';
import { AuthClient } from './auth.js';
import { FileStorageClient } from './file_storage_client.js';
import { GoogleCloudSpeechSynthesizerWithDbCache } from './speech_synthesizer.js';
import { GoogleCloudTranslatorWithDbCache } from './translator.js';
import { Workspace } from './workspace.js';

export interface AppContext {
  auth: AuthClient;
  fileStorageClient: FileStorageClient;
  speechSynthesizer: GoogleCloudSpeechSynthesizerWithDbCache;
  translator: GoogleCloudTranslatorWithDbCache;
  workspace: Workspace;
  logger: Logger;
}
