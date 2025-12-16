import { AudioPlayer as SharedAudioPlayer } from '@votingworks/backend';
import { Logger } from '@votingworks/logging';

export type SoundName = 'alarm' | 'chime' | 'error' | 'success' | 'warning';

/**
 * Audio player for VxMark that plays sounds through the builtin speaker.
 */
export class Player {
  private readonly sharedPlayer: SharedAudioPlayer;

  constructor(
    nodeEnv: 'production' | 'development' | 'test',
    logger: Logger,
    outputName: string
  ) {
    this.sharedPlayer = new SharedAudioPlayer({
      nodeEnv,
      logger,
      outputName,
      soundsDirectory: __dirname,
    });
  }

  async play(soundName: SoundName): Promise<void> {
    return await this.sharedPlayer.play(soundName);
  }
}
