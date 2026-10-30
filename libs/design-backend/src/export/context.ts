import type {
  GoogleCloudSpeechSynthesizer,
  GoogleCloudTranslator,
} from '@votingworks/backend';
import type { ElectionId } from '@votingworks/types';
import type { FileStorageClient } from '../file_storage.js';
import type { Store } from '../store.js';
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
  workspace: { store: Store };
  onElectionPackageExported?: (
    event: ElectionPackageExportedEvent
  ) => Promise<void>;
}
