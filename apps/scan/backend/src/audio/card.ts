import {
  AUDIO_DEVICE_DEFAULT_SINK,
  AudioCardProfile,
  getAudioCardName,
  setAudioCardProfile,
  setAudioVolume,
} from '@votingworks/backend';
import { Logger } from '@votingworks/logging';
import { NODE_ENV } from '../globals';

/**
 * Last round of testing done on a v4 VxComputer with HWTA running.
 * Over 10 reboots, the number of retries before successful connection to the
 * pulseaudio service ranged from 3 to 4. Setting the max a little higher to be
 * safe.
 */
export const MAX_CARD_DETECTION_RETRIES = 6;

export class AudioCard {
  constructor(
    private readonly nodeEnv: typeof NODE_ENV,
    private readonly logger: Logger,
    private readonly card: { name: string }
  ) {}

  static async default(
    nodeEnv: typeof NODE_ENV,
    logger: Logger
  ): Promise<AudioCard> {
    const nameRes = await getAudioCardName({
      logger,
      maxRetries: MAX_CARD_DETECTION_RETRIES,
      nodeEnv,
    });
    const name = nameRes.assertOk('audio card detection failed');

    return new AudioCard(nodeEnv, logger, { name });
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
