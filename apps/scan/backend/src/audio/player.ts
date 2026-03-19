import {
  AUDIO_DEVICE_DEFAULT_SINK,
  AudioPlayer as SharedAudioPlayer,
} from '@votingworks/backend';
import { Logger } from '@votingworks/logging';
import { AudioCard } from './card';

export type SoundName = 'alarm' | 'error' | 'success' | 'warning';

/**
 * Audio player for VxScan that plays sounds through the builtin speaker.
 */
export class Player {
  private readonly sharedPlayer: SharedAudioPlayer;

  constructor(
    private readonly nodeEnv: 'production' | 'development' | 'test',
    private readonly logger: Logger,
    private readonly card: AudioCard
  ) {
    this.sharedPlayer = new SharedAudioPlayer({
      nodeEnv: this.nodeEnv,
      logger: this.logger,
      outputName: AUDIO_DEVICE_DEFAULT_SINK,
      soundsDirectory: import.meta.dirname,
    });
  }

  async play(soundName: SoundName): Promise<void> {
    // [TODO] Add locking? We can either ignore/log successive plays while
    // there's already one in progress (or queue them up, but a well-behaved
    // client shouldn't be sending overlapping play requests).
    try {
      await this.card.useSpeaker();
      await this.sharedPlayer.play(soundName);
    } finally {
      await this.card.useHeadphones();
    }
  }
}
