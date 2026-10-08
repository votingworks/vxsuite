import type {
  GoogleCloudSpeechSynthesizer,
  GoogleCloudTranslator,
} from '@votingworks/backend';
import type { BaseLogger } from '@votingworks/logging';
import type { FileStorageClient } from '../file_storage_client.js';
import type { Workspace } from '../workspace.js';

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
