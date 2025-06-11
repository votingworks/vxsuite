import { LogEventId, Logger } from '@votingworks/logging';
import { err, ok, Result } from '@votingworks/basics';
import { execFile } from '../exec';
import { NODE_ENV } from '../scan_globals';

/**
 * Errors returned by {@link setDefaultAudio}.
 */
export type SetDefaultAudioErr =
  | { code: 'execFileError'; error: unknown }
  | { code: 'pactlError'; error: string };

/**
 * Result returned by {@link setDefaultAudio}.
 */
export type SetDefaultAudioResult = Result<void, SetDefaultAudioErr>;

/**
 * Sets the default PulseAudio output device.
 *
 * @param sinkName - Name of the output device, as returned from
 *   `getAudioInfo` (see `./get_audio_info.ts`).
 */
export async function setDefaultAudio(
  sinkName: string,
  ctx: {
    logger: Logger;
    nodeEnv: typeof NODE_ENV;
  }
): Promise<SetDefaultAudioResult> {
  const { logger, nodeEnv } = ctx;
  let errorOutput: string;

  try {
    if (nodeEnv === 'production') {
      ({ stderr: errorOutput } = await execFile('sudo', [
        '/vx/code/app-scripts/pactl.sh',
        'set-default-sink',
        sinkName,
      ]));
    } else {
      ({ stderr: errorOutput } = await execFile('pactl', [
        'set-default-sink',
        sinkName,
      ]));
    }
  } catch (error) {
    void logger.logAsCurrentRole(LogEventId.AudioDeviceSelectionError, {
      message: `Unable to run pactl set-default-sink command: ${error}`,
      disposition: 'failure',
    });

    return err({ code: 'execFileError', error });
  }

  if (errorOutput) {
    void logger.logAsCurrentRole(LogEventId.AudioDeviceSelectionError, {
      message: `pactl set-default-sink command failed: ${errorOutput}`,
      disposition: 'failure',
    });

    return err({ code: 'pactlError', error: errorOutput });
  }

  void logger.logAsCurrentRole(LogEventId.AudioDeviceSelected, {
    message: `Selected default audio output: ${sinkName}`,
    disposition: 'success',
  });

  return ok();
}
