import { LogEventId, Logger } from '@votingworks/logging';
import { assert, err, ok, Result } from '@votingworks/basics';
import { execFile } from '../exec';
import { NODE_ENV } from '../scan_globals';

/**
 * Errors returned by {@link setAudioVolume}.
 */
export type SetAudioVolumeErr =
  | { code: 'execFileError'; error: unknown }
  | { code: 'pactlError'; error: string };

/**
 * Result returned by {@link setAudioVolume}.
 */
export type SetAudioVolumeResult = Result<void, SetAudioVolumeErr>;

/**
 * Sets the volume of a PulseAudio output device.
 */
export async function setAudioVolume(params: {
  logger: Logger;
  nodeEnv: typeof NODE_ENV;
  /**
   * Name of the output device (see `./get_audio_info.ts`).
   */
  sinkName: string;
  /**
   * The target percentage volume (0-100);
   */
  volumePct: number;
}): Promise<SetAudioVolumeResult> {
  const { logger, nodeEnv, sinkName, volumePct } = params;
  let errorOutput: string;

  assert(
    volumePct >= 0 && volumePct <= 100,
    'Audio volume must be between 0 and 100'
  );

  try {
    if (nodeEnv === 'production') {
      ({ stderr: errorOutput } = await execFile('sudo', [
        '/vx/code/app-scripts/pactl.sh',
        'set-sink-volume',
        sinkName,
        `${volumePct}%`,
      ]));
    } else {
      ({ stderr: errorOutput } = await execFile('pactl', [
        'set-sink-volume',
        sinkName,
        `${volumePct}%`,
      ]));
    }
  } catch (error) {
    void logger.logAsCurrentRole(LogEventId.AudioVolumeChangeError, {
      message: `Unable to run pactl set-sink-volume command: ${error}`,
      disposition: 'failure',
    });

    return err({ code: 'execFileError', error });
  }

  if (errorOutput) {
    void logger.logAsCurrentRole(LogEventId.AudioVolumeChangeError, {
      message: `pactl set-sink-volume command failed: ${errorOutput}`,
      disposition: 'failure',
    });

    return err({ code: 'pactlError', error: errorOutput });
  }

  void logger.logAsCurrentRole(LogEventId.AudioVolumeChanged, {
    message: `Audio volume for ${sinkName} set to ${volumePct}%`,
    disposition: 'success',
  });

  return ok();
}
