/* istanbul ignore file - pending implementation. */

import { UiStringAudioClip } from '@votingworks/types';

export interface AudioPlayerParams {
  clip: UiStringAudioClip;
  gainDb: number;
  playbackRate: number;
  webAudioContext: AudioContext;
}

export interface AudioPlayer {
  readonly play: () => Promise<void>;
  readonly setPlaybackRate: (rate: number) => void;
  readonly setVolume: (gainDb: number) => void;
  readonly stop: () => void;
}

export async function newAudioPlayer(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _params: AudioPlayerParams
): Promise<AudioPlayer> {
  // TODO(kofi): Implement.
  return Promise.resolve({
    play: () => Promise.resolve(),
    setPlaybackRate: () => {},
    setVolume: () => {},
    stop: () => {},
  });
}
