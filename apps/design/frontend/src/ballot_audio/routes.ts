export interface BallotAudioPathParams {
  electionId: string;
  stringKey?: string;
  subkey?: string;
  audioType?: 'ipa' | 'rec' | 'tts';
}
