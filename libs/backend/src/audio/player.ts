import { LogEventId, Logger } from '@votingworks/logging';
import { execFile } from '../exec';

/**
 * Options for configuring the audio player.
 */
export interface AudioPlayerOptions {
  nodeEnv: 'production' | 'development' | 'test';
  logger: Logger;
  /**
   * The name of the target audio output, as identified via
   * `pactl list sinks` - see `@votingworks/backend/audio.getAudioInfo()`.
   */
  outputName: string;
  /**
   * The directory containing the sound files.
   */
  soundsDirectory: string;
}

/**
 * Audio player that plays sound files through a specific audio output device.
 * Sound files should be `.mp3` files named after the sound (e.g., `success.mp3`).
 */
export class AudioPlayer {
  private readonly nodeEnv: 'production' | 'development' | 'test';
  private readonly logger: Logger;
  private readonly outputName: string;
  private readonly soundsDirectory: string;

  constructor(options: AudioPlayerOptions) {
    this.nodeEnv = options.nodeEnv;
    this.logger = options.logger;
    this.outputName = options.outputName;
    this.soundsDirectory = options.soundsDirectory;
  }

  async play(soundName: string): Promise<void> {
    let errorOutput: string;
    const soundPath = `${this.soundsDirectory}/${soundName}.mp3`;
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
