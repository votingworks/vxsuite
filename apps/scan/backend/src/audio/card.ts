import {
  AUDIO_DEVICE_DEFAULT_SINK,
  AudioCardProfile,
  getAudioCardName,
  type NODE_ENV,
  setAudioCardProfile,
  setAudioVolume,
} from '@votingworks/backend';
import { Logger } from '@votingworks/logging';

/**
 * Headphone-based screen reader audio is calibrated against a 100% system
 * volume level (assuming screen hardware speaker volume is also set to
 * maximum). Voter-controlled volume change is implemented client-side.
 */
export const DEFAULT_HEADPHONE_VOLUME = 100;

/**
 * The screen speaker on newer VxScan v4 builds is fairly underpowered and
 * limited in volume output when both hardware and software volume are set to
 * maximum. To compensate, we boost the software volume a bit to bring up the
 * level of important system sounds.
 */
export const DEFAULT_SPEAKER_VOLUME = 120;

/**
 * Last round of testing done on a v4 VxComputer with HWTA running.
 * Over 10 reboots, the number of retries before successful connection to the
 * pulseaudio service ranged from 3 to 4. Setting the max a little higher to be
 * safe.
 */
export const MAX_CARD_DETECTION_RETRIES = 6;

export class AudioCard {
  constructor(
    private readonly nodeEnv: NODE_ENV,
    private readonly logger: Logger,
    private readonly card: { name: string }
  ) {}

  static async default(nodeEnv: NODE_ENV, logger: Logger): Promise<AudioCard> {
    const nameRes = await getAudioCardName({
      logger,
      maxRetries: MAX_CARD_DETECTION_RETRIES,
      nodeEnv,
    });
    const name = nameRes.assertOk('audio card detection failed');

    const card = new AudioCard(nodeEnv, logger, { name });
    await card.configureDefaults();

    return card;
  }

  /**
   * Resets the audio card's speaker and headphone profiles to their
   * canonical initial states for VxScan.
   */
  async configureDefaults(): Promise<void> {
    await this.useSpeaker();
    await this.setVolume(DEFAULT_SPEAKER_VOLUME);

    await this.useHeadphones();
    await this.setVolume(DEFAULT_HEADPHONE_VOLUME);
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
