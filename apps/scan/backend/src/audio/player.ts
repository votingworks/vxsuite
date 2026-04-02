import {
  AUDIO_DEVICE_DEFAULT_SINK,
  AudioPlayer as SharedAudioPlayer,
} from '@votingworks/backend';
import { Logger } from '@votingworks/logging';
import { AudioCard } from './card';

export type SoundName = 'alarm' | 'error' | 'success' | 'warning';

/**
 * Audio player for VxScan that plays sounds through the built-in speaker.
 *
 * When the screen reader is enabled, the audio card defaults to headphone output for screen reader
 * audio and temporarily switches to speaker output for sound effects. When the screen reader is
 * disabled, the audio card defaults to speaker output without toggling.
 */
export class Player {
  private readonly sharedPlayer: SharedAudioPlayer;
  private isScreenReaderEnabled = false;

  constructor(
    private readonly nodeEnv: 'production' | 'development' | 'test',
    private readonly logger: Logger,
    private readonly card: AudioCard
  ) {
    this.sharedPlayer = new SharedAudioPlayer({
      nodeEnv: this.nodeEnv,
      logger: this.logger,
      outputName: AUDIO_DEVICE_DEFAULT_SINK,
      soundsDirectory: __dirname,
    });
  }

  async setIsScreenReaderEnabled(enabled: boolean): Promise<void> {
    this.isScreenReaderEnabled = enabled;
    if (enabled) {
      await this.card.useHeadphones();
      await this.card.setVolume(100);
    } else {
      await this.card.useSpeaker();
      // Speaker volume is not currently set by the app
    }
  }

  async setVolume(volumePct: number): Promise<void> {
    await this.card.setVolume(volumePct);
  }

  /**
   * Plays a sound through the built-in speaker
   */
  async play(soundName: SoundName): Promise<void> {
    // [TODO] Add locking? We can either ignore/log successive plays while
    // there's already one in progress (or queue them up, but a well-behaved
    // client shouldn't be sending overlapping play requests).

    if (!this.isScreenReaderEnabled) {
      await this.sharedPlayer.play(soundName);
      return;
    }

    try {
      await this.card.useSpeaker();
      await this.sharedPlayer.play(soundName);
    } finally {
      await this.card.useHeadphones();
    }
  }
}
