import { LogEventId, Logger } from '@votingworks/logging';
import { execFile } from '../exec';

/** System audio info. */
export interface AudioInfo {
  headphonesActive: boolean;
}

/** Get current system audio status. */
export async function getAudioInfo(logger: Logger): Promise<AudioInfo> {
  let errorOutput: string;
  let commandOutput: string;

  try {
    ({ stderr: errorOutput, stdout: commandOutput } = await execFile('sudo', [
      '/vx/code/app-scripts/pactl.sh',
      'list',
      'sinks',
    ]));
  } catch (error) {
    void logger.logAsCurrentRole(LogEventId.HeadphonesDetectionError, {
      message: `Unable to run pactl command: ${error}}`,
      disposition: 'failure',
    });

    return { headphonesActive: false };
  }

  if (errorOutput) {
    void logger.logAsCurrentRole(LogEventId.HeadphonesDetectionError, {
      message: `pactl command failed: ${errorOutput}}`,
      disposition: 'failure',
    });

    return { headphonesActive: false };
  }

  const headphonesActive = /Active Port:.+headphones/.test(commandOutput);

  return {
    headphonesActive,
  };
}
