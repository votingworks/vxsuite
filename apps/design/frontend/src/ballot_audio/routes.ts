import { ElectionStringKey } from '@votingworks/types';

export interface BallotAudioPathParams {
  electionId: string;
  stringKey?: ElectionStringKey;
  subkey?: string;
}
