import { ElectionStringKey, LanguageCode } from '@votingworks/types';

export interface BallotAudioPathParams {
  electionId: string;
  stringKey?: ElectionStringKey;
  language?: LanguageCode;
  subkey?: string;
}
