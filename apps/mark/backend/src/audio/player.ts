import { AudioPlayer as SharedAudioPlayer } from '@votingworks/backend';
import { assert } from '@votingworks/basics';
import { Logger } from '@votingworks/logging';

export const SoundNameValues = [
  'alarm',
  'chime',
  'error',
  'success',
  'warning',
] as const;
export type SoundName = (typeof SoundNameValues)[number];

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
    assert(SoundNameValues.includes(soundName));
    return await this.sharedPlayer.play(soundName);
  }
}
