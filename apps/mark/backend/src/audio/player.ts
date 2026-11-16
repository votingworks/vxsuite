import {
  analogAndHdmi,
  type audio,
  DEFAULT_HEADPHONE_VOLUME_PCT,
  getAudioInfoWithRetry,
  getNodeEnv,
  MAX_AUDIO_DETECTION_RETRIES,
  MIN_AUDIO_DETECTION_RETRY_DELAY_MS,
  setAudioVolume,
  setDefaultAudio,
  usbAndHdmi,
} from '@votingworks/backend';
import type { Logger } from '@votingworks/logging';

export const SoundNameValues = [
  'alarm',
  'chime',
  'error',
  'success',
  'warning',
] as const;
export type SoundName = (typeof SoundNameValues)[number];

export type AudioCard = analogAndHdmi.AudioCard;

export interface AudioPlayer {
  play(soundName: SoundName): Promise<void>;
}

export interface Init {
  headphoneVolumePct?: number;
  logger: Logger;
}

/**
 * Initializes the audio system and creates a new system audio player.
 *
 * Returns a {@link usbAndHdmi.Player} if a USB audio card is detected (older v4
 * builds with headphones plugged into the accessible controller), or
 * {@link analogAndHdmi.Player} otherwise (v4 builds with headphones plugged
 * into the builtin headphone port).
 */
export async function newAudioPlayer(init: Init): Promise<AudioPlayer> {
  const nodeEnv = getNodeEnv();

  const audioInfo = await getAudioInfoWithRetry({
    baseRetryDelayMs: MIN_AUDIO_DETECTION_RETRY_DELAY_MS,
    logger: init.logger,
    maxRetries: MAX_AUDIO_DETECTION_RETRIES,
    nodeEnv,
  });

  if (audioInfo.usb) {
    await initializeUsbAudio(audioInfo.usb, init);
    return usbAndHdmi.defaultAudioPlayer({
      device: audioInfo.builtin,
      logger: init.logger,
      nodeEnv,
      soundsDirectory: import.meta.dirname,
    });
  }

  const player = analogAndHdmi.defaultAudioPlayer({
    card: await analogAndHdmi.defaultAudioCard(nodeEnv, init.logger),
    logger: init.logger,
    nodeEnv,
    soundsDirectory: import.meta.dirname,
  });

  if (init.headphoneVolumePct !== undefined) {
    await player.setHeadphoneVolume(init.headphoneVolumePct);
  }

  return player;
}

export function getMockAudioPlayer(): AudioPlayer {
  return {
    play: () => Promise.resolve(),
  };
}

async function initializeUsbAudio(
  info: audio.UsbAudio,
  init: Init
): Promise<void> {
  const nodeEnv = getNodeEnv();

  (
    await setDefaultAudio(info.name, {
      logger: init.logger,
      nodeEnv,
    })
  ).assertOk(`unable to set USB audio as default output`);

  (
    await setAudioVolume({
      logger: init.logger,
      nodeEnv,
      sinkName: info.name,
      volumePct: init.headphoneVolumePct ?? DEFAULT_HEADPHONE_VOLUME_PCT,
    })
  ).assertOk('unable to set USB audio volume');
}
