import type {
  ElectionId,
  TtsEdit,
  TtsEditEntry,
  TtsEditKey,
} from '@votingworks/types';
import type { StateFeaturesConfig } from './features.js';
import type { Jurisdiction } from './types.js';

export interface DesignFeaturesProvider {
  getJurisdiction(jurisdictionId: string): Promise<Jurisdiction>;
  getStateFeatures(electionId: ElectionId): Promise<StateFeaturesConfig>;
}

export interface TtsEditsStore {
  ttsEditsAll(params: { jurisdictionId: string }): Promise<TtsEditEntry[]>;
  ttsEditsGet(key: TtsEditKey): Promise<TtsEdit | null>;
  ttsEditsSet(key: TtsEditKey, data: TtsEdit): Promise<void>;
}
