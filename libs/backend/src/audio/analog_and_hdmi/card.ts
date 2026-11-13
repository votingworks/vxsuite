import type { Logger } from '@votingworks/logging';

import type { NODE_ENV } from '../../globals.js';
import {
  AUDIO_DEVICE_DEFAULT_SINK,
  AudioCardProfile,
  getAudioCardName,
  setAudioCardProfile,
  setAudioVolume,
} from '../../system_call/index.js';
import {
  DEFAULT_HEADPHONE_VOLUME_PCT,
  DEFAULT_SPEAKER_VOLUME_PCT,
  MAX_AUDIO_DETECTION_RETRIES,
  MIN_AUDIO_DETECTION_RETRY_DELAY_MS,
} from '../config.js';

/**
 * Control interface for the builtin audio card on VxComputer boards
 * (VxMark/VxScan v4).
 */
export class AudioCard {
  private readonly nodeEnv: NODE_ENV;
  private readonly logger: Logger;
  private readonly card: { name: string };

  constructor(nodeEnv: NODE_ENV, logger: Logger, card: { name: string }) {
    this.nodeEnv = nodeEnv;
    this.logger = logger;
    this.card = card;
  }

  /**
   * Resets the audio card's speaker and headphone profiles to their
   * canonical initial states for VxScan.
   */
  async configureDefaults(): Promise<void> {
    // [TODO] We might be able to play audio directly through the HDMI port
    // without switching profiles:
    // https://wiki.archlinux.org/title/PulseAudio/Examples (sec. 5 and 6).

    await this.useSpeaker();
    await this.setVolume(DEFAULT_SPEAKER_VOLUME_PCT);

    await this.useHeadphones();
    await this.setVolume(DEFAULT_HEADPHONE_VOLUME_PCT);
  }

  /**
   * Sets the volume for the current active output (set via
   * {@link useHeadphones} or {@link useSpeaker}).
   */
  async setVolume(volumePct: number): Promise<void> {
    const res = await setAudioVolume({
      logger: this.logger,
      nodeEnv: this.nodeEnv,
      sinkName: AUDIO_DEVICE_DEFAULT_SINK,
      volumePct,
    });

    res.assertOk('unable to set audio volume');
  }

  async useHeadphones(): Promise<void> {
    await this.setProfile(AudioCardProfile.ANALOG);
  }

  async useSpeaker(): Promise<void> {
    await this.setProfile(AudioCardProfile.HDMI);
  }

  private async setProfile(profile: AudioCardProfile): Promise<void> {
    const res = await setAudioCardProfile({
      cardName: this.card.name,
      logger: this.logger,
      nodeEnv: this.nodeEnv,
      profile,
    });

    res.assertOk(`unable to switch audio output`);
  }
}

/**
 * Returns a handle to the primary system audio card, configured with defaults
 * for v4 VxComputer machines.
 *
 * Selects the analog headphone output as primary by default.
 */
export async function defaultAudioCard(
  nodeEnv: NODE_ENV,
  logger: Logger
): Promise<AudioCard> {
  const nameRes = await getAudioCardName({
    baseRetryDelayMs: MIN_AUDIO_DETECTION_RETRY_DELAY_MS,
    logger,
    maxRetries: MAX_AUDIO_DETECTION_RETRIES,
    nodeEnv,
  });
  const name = nameRes.assertOk('audio card detection failed');

  const card = new AudioCard(nodeEnv, logger, { name });
  await card.configureDefaults();

  return card;
}
