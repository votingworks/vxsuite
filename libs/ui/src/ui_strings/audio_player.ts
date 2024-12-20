import { Buffer } from 'node:buffer';

import { UiStringAudioClip } from '@votingworks/types';
import { deferred } from '@votingworks/basics';
import { AudioVolume, getAudioGainAmountDb } from './audio_volume';

/**
 * Lowest absolute audio sample value, between 0 and 1, considered to be
 * non-silence.
 *
 * TODO(kofi): Optimise further upstream instead - we could add an audio cleanup
 * step in VxDesign, which would be particularly useful for user-recorded audio.
 */
export const SILENT_SAMPLE_ABSOLUTE_VALUE_THRESHOLD = 0.0025;

export interface AudioPlayerParams {
  clip: UiStringAudioClip;
  webAudioContext: AudioContext;
}

export interface AudioPlayer {
  readonly play: () => Promise<void>;
  readonly setPlaybackRate: (rate: number) => void;
  readonly setVolume: (volume: AudioVolume) => void;
  readonly stop: () => void;
}

/**
 * ToneJS GrainPlayer configuration used for a particular playback rate.
 *
 * Audio grain configuration needs to be varied for slower playback rates to
 * minimize phasing and echo artefacts. The values below have been tuned
 * manually, but may need tweaking after some testing with a wider variety of
 * clips.
 *
 * See https://en.wikipedia.org/wiki/Granular_synthesis for more background info
 * on granular synthesis as a method of varying audio speed and pitch
 * independently.
 */
interface RateBasedConfig {
  grainSizeSeconds: number;
  grainOverlapSeconds: number;
}

const RATE_CONFIG_VERY_SLOW: RateBasedConfig = {
  grainOverlapSeconds: 0.025,
  grainSizeSeconds: 0.02,
};

const RATE_CONFIG_DEFAULT: RateBasedConfig = {
  grainOverlapSeconds: 0.05,
  grainSizeSeconds: 0.1,
};

/**
 * Lazily import and instantiate the ToneJS library to avoid the creation of the
 * audio worker thread for apps that don't need audio (and until playback is
 * actually needed).
 *
 * ToneJS also automatically creates a global web AudioContext on import, so we
 * replace the context reference here with the one passed down from the Vx app.
 */
async function initializeToneJs(webAudioContext: AudioContext) {
  const { getContext, GrainPlayer, setContext } = await import('tone');

  if (getContext().rawContext !== webAudioContext) {
    getContext().dispose();
    setContext(webAudioContext);
  }

  return { GrainPlayer };
}

async function newToneJsGrainPlayer(params: AudioPlayerParams) {
  const { clip, webAudioContext } = params;

  const toneJsLib = initializeToneJs(webAudioContext);

  const audioBuffer = await webAudioContext.decodeAudioData(
    Buffer.from(clip.dataBase64, 'base64').buffer
  );

  //
  // Trim silence at the beginning of clips to minimize the latency between user
  // actions and audio feedback.
  //
  // [7.2-N – System response time: The system initially responds to a voter
  // action in no more than 0.5 seconds for an audio response.]
  //

  let firstNonSilentSampleIndex = 0;
  const audioSamples = audioBuffer.getChannelData(0);
  for (let i = 0; i < audioBuffer.length; i += 1) {
    if (Math.abs(audioSamples[i]) > SILENT_SAMPLE_ABSOLUTE_VALUE_THRESHOLD) {
      firstNonSilentSampleIndex = i;
      break;
    }
  }

  const trimmedAudioBuffer = webAudioContext.createBuffer(
    audioBuffer.numberOfChannels,
    audioBuffer.length - firstNonSilentSampleIndex,
    audioBuffer.sampleRate
  );
  trimmedAudioBuffer.copyToChannel(
    audioSamples.slice(firstNonSilentSampleIndex),
    0
  );

  const { GrainPlayer } = await toneJsLib;
  return new GrainPlayer(trimmedAudioBuffer);
}

export async function newAudioPlayer(
  params: AudioPlayerParams
): Promise<AudioPlayer> {
  const player = await newToneJsGrainPlayer(params);
  const deferredEnd = deferred<void>();

  function setPlaybackRate(playbackRate: number) {
    let config = RATE_CONFIG_DEFAULT;
    if (playbackRate < 0.75) {
      config = RATE_CONFIG_VERY_SLOW;
    }

    player.playbackRate = playbackRate;
    player.grainSize = config.grainSizeSeconds;
    player.overlap = config.grainOverlapSeconds;
  }

  function setVolume(volume: AudioVolume) {
    player.volume.value = getAudioGainAmountDb(volume);
  }

  function dispose() {
    player.disconnect();

    if (!player.buffer.disposed) {
      player.buffer.dispose();
    }

    if (!player.disposed) {
      player.dispose();
    }
  }

  async function play() {
    if (player.state === 'stopped') {
      player.onstop = () => {
        deferredEnd.resolve();
        dispose();
      };
      player.connect(params.webAudioContext.destination);
      player.start();
    }

    await deferredEnd.promise;
  }

  function stop() {
    player.stop();
    dispose();
  }

  return {
    play,
    setPlaybackRate,
    setVolume,
    stop,
  };
}
