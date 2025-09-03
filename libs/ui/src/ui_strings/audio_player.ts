import { UiStringAudioClip } from '@votingworks/types';
import { deferred } from '@votingworks/basics';

export interface AudioPlayerParams {
  AudioCtor?: typeof Audio;
  clip: UiStringAudioClip;
  output: AudioNode;
  webAudioContext: AudioContext;
}

export interface AudioPlayer {
  readonly play: () => Promise<void>;
  readonly setPlaybackRate: (rate: number) => void;
  readonly stop: () => Promise<void>;
}

export function newAudioPlayer(params: AudioPlayerParams): AudioPlayer {
  const { AudioCtor = Audio, clip, output, webAudioContext } = params;

  const audio = new AudioCtor(clip.dataBase64);
  audio.preservesPitch = true;
  audio.volume = 1; // Volume controlled via top-level audio context.

  const srcNode = webAudioContext.createMediaElementSource(audio);
  srcNode.connect(output);

  const deferredEnd = deferred<void>();
  let pendingPlay: Promise<void> | undefined;

  function setPlaybackRate(playbackRate: number) {
    audio.playbackRate = playbackRate;
  }

  function dispose() {
    audio.onended = null;
    srcNode.disconnect();
    audio.src = '';
  }

  async function play() {
    audio.onended ??= () => deferredEnd.resolve();

    // pendingPlay = audio.play();
    await pendingPlay;

    await deferredEnd.promise;
  }

  async function pause() {
    // Attempting to pause audio while the initial play request is still in
    // progress results in an error.
    await pendingPlay;

    audio.pause();
  }

  async function stop() {
    await pause();
    dispose();
  }

  return {
    play,
    setPlaybackRate,
    stop,
  };
}
