import { AuthClientInterface } from './auth/client';
import { FileStorageClient } from './file_storage_client';
import { GoogleCloudSpeechSynthesizerWithDbCache } from './speech_synthesizer';
import { GoogleCloudTranslatorWithDbCache } from './translator';
import { Workspace } from './workspace';

export interface AppContext {
  auth: AuthClientInterface;
  fileStorageClient: FileStorageClient;
  speechSynthesizer: GoogleCloudSpeechSynthesizerWithDbCache;
  translator: GoogleCloudTranslatorWithDbCache;
  workspace: Workspace;
}
