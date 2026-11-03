import type {
  GoogleCloudSpeechSynthesizer,
  GoogleCloudTranslator,
} from '@votingworks/backend';
import type {
  ElectionRegisteredVoterCounts,
  TtsEditEntry,
} from '@votingworks/types';
import type { FileStorageClient } from '../file_storage.js';
import type { ElectionRecord } from '../election_record.js';
import type { Jurisdiction } from '../types.js';

export type EmitProgressFunction = (
  label: string,
  progress: number,
  total: number
) => void;

export interface ElectionPackageRenderContext {
  fileStorageClient: FileStorageClient;
  speechSynthesizer: GoogleCloudSpeechSynthesizer;
  translator: GoogleCloudTranslator;
  rendererPoolSize?: number;
}

export interface ElectionPackageExportInput {
  electionRecord: ElectionRecord;
  compact: boolean;
  registeredVoterCounts: ElectionRegisteredVoterCounts;
  jurisdiction: Jurisdiction;
  ttsEdits?: TtsEditEntry[];
}

export interface ElectionPackageExportResult {
  ballotHash: string;
  electionPackageUrl: string;
  electionData: string;
  officialBallotsUrl: string;
  sampleBallotsUrl?: string;
  testBallotsUrl?: string;
}
