import { execFile } from '@votingworks/backend';
import { LogEventId, Logger } from '@votingworks/logging';
import { NODE_ENV } from '../globals';

export type SoundName =
  | 'alarm'
  | 'chime'
  | 'error'
  | 'noise'
  | 'success'
  | 'warning';

export class Player {
  constructor(
    private readonly nodeEnv: typeof NODE_ENV,
    private readonly logger: Logger,

    /**
     * The name of the target audio output, as identified via
     * `pactl list sinks` - see `@votingworks/backend/getAudioInfo()`.
     */
    private readonly outputName: string
  ) {}

  async play(soundName: SoundName): Promise<void> {
    let errorOutput: string;
    const soundPath = `${__dirname}/${soundName}.mp3`;
    const deviceArg = `--device=${this.outputName}`;

    try {
      if (this.nodeEnv === 'production') {
        ({ stderr: errorOutput } = await execFile('sudo', [
          '/vx/code/app-scripts/paplay.sh',
          soundPath,
          deviceArg,
        ]));
      } else {
        ({ stderr: errorOutput } = await execFile('paplay', [
          soundPath,
          deviceArg,
        ]));
      }
    } catch (error) {
      void this.logger.logAsCurrentRole(LogEventId.AudioPlaybackError, {
        message: `Unable to run 'paplay' command: ${error}}`,
        disposition: 'failure',
      });

      return;
    }

    if (errorOutput) {
      void this.logger.logAsCurrentRole(LogEventId.AudioPlaybackError, {
        message: `'paplay' command failed: ${errorOutput}}`,
        disposition: 'failure',
      });
    }
  }
}
