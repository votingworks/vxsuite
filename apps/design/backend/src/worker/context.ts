import { BaseLogger } from '@votingworks/logging';
import { FileStorageClient } from '../file_storage_client';
import { GoogleCloudSpeechSynthesizerWithDbCache } from '../speech_synthesizer';
import { GoogleCloudTranslatorWithDbCache } from '../translator';
import { Workspace } from '../workspace';

export interface WorkerContext {
  fileStorageClient: FileStorageClient;
  speechSynthesizer: GoogleCloudSpeechSynthesizerWithDbCache;
  logger: BaseLogger;
  translator: GoogleCloudTranslatorWithDbCache;
  workspace: Workspace;
}
