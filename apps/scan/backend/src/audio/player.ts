import {
  AudioPort,
  setBuiltinAudioPort,
  AudioPlayer as SharedAudioPlayer,
} from '@votingworks/backend';
import { Logger } from '@votingworks/logging';

export type SoundName = 'alarm' | 'error' | 'success' | 'warning';

export const MAX_PORT_CHANGE_RETRIES = 3;

/**
 * Audio player for VxScan that plays sounds through the builtin speaker.
 */
export class Player {
  private readonly sharedPlayer: SharedAudioPlayer;

  constructor(
    private readonly nodeEnv: 'production' | 'development' | 'test',
    private readonly logger: Logger,
    outputName: string
  ) {
    this.sharedPlayer = new SharedAudioPlayer({
      nodeEnv: this.nodeEnv,
      logger: this.logger,
      outputName,
      soundsDirectory: __dirname,
    });
  }

  async play(soundName: SoundName): Promise<void> {
    await setBuiltinAudioPort(this.nodeEnv, AudioPort.SPEAKER, this.logger, {
      maxRetries: MAX_PORT_CHANGE_RETRIES,
    });

    await this.sharedPlayer.play(soundName);

    await setBuiltinAudioPort(this.nodeEnv, AudioPort.HEADPHONES, this.logger, {
      maxRetries: MAX_PORT_CHANGE_RETRIES,
    });
  }
}
