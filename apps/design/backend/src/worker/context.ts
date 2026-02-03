import { BaseLogger } from '@votingworks/logging';
import { FileStorageClient } from '../file_storage_client';
import { GoogleCloudSpeechSynthesizerWithDbCache } from '../speech_synthesizer';
import { GoogleCloudTranslatorWithDbCache } from '../translator';
import { Workspace } from '../workspace';

export interface WorkerContext {
  fileStorageClient: FileStorageClient;
  speechSynthesizer: GoogleCloudSpeechSynthesizerWithDbCache;
  translator: GoogleCloudTranslatorWithDbCache;
  workspace: Workspace;
  logger: BaseLogger;
}

export type EmitProgressFunction = (
  label: string,
  progress: number,
  total: number
) => void;
