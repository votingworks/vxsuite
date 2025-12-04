import { ElectionStringKey, TtsExportSource } from '@votingworks/types';

export interface BallotAudioPathParams {
  electionId: string;
  stringKey?: ElectionStringKey;
  subkey?: string;
  ttsMode?: TtsExportSource;
}
