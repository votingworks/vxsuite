import type {
  GoogleCloudSpeechSynthesizer,
  GoogleCloudTranslator,
} from '@votingworks/backend';
import type { ElectionId } from '@votingworks/types';
import type { FileStorageClient } from '../file_storage.js';
import type { ElectionStore } from '../election_store.js';
import type { BackgroundTaskStore } from '../background_task_store.js';
import type {
  DesignFeaturesProvider,
  TtsEditsStore,
} from '../design_providers.js';
import type { Jurisdiction } from '../types.js';

export type EmitProgressFunction = (
  label: string,
  progress: number,
  total: number
) => void;

export interface ElectionPackageExportedEvent {
  electionId: ElectionId;
  electionPackageUrl: string;
  jurisdiction: Jurisdiction;
}

export interface ElectionPackageExportContext {
  fileStorageClient: FileStorageClient;
  speechSynthesizer: GoogleCloudSpeechSynthesizer;
  translator: GoogleCloudTranslator;
  elections: ElectionStore;
  tasks: BackgroundTaskStore;
  features: DesignFeaturesProvider;
  ttsEdits?: TtsEditsStore;
  rendererPoolSize?: number;
  onElectionPackageExported?: (
    event: ElectionPackageExportedEvent
  ) => Promise<void>;
}
