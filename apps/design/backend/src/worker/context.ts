import { GoogleCloudSpeechSynthesizer, GoogleCloudTranslator } from '@votingworks/backend';
import { BaseLogger } from '@votingworks/logging';
import { FileStorageClient } from '../file_storage_client';
import { Workspace } from '../workspace';

export interface WorkerContext {
  fileStorageClient: FileStorageClient;
  speechSynthesizer: GoogleCloudSpeechSynthesizer;
  translator: GoogleCloudTranslator;
  workspace: Workspace;
  logger: BaseLogger;
}

export type EmitProgressFunction = (
  label: string,
  progress: number,
  total: number
) => void;
