/* istanbul ignore file - @preserve */
import { execFile } from '@votingworks/backend';
import { sleep } from '@votingworks/basics';
import { LogEventId, Logger } from '@votingworks/logging';
import { getNodeEnv } from '../globals';

export const MAX_PULSE_COMMAND_ATTEMPTS = 3;
const PULSE_AUDIO_SINK_ID_VSAP_SOUND_CARD = '0';

/**
 * Audio output port names for VSAP BMD sound card. These are fairly
 * hardware-specific and not guaranteed to work in other environments.
 */
export enum AudioOutput {
  SPEAKER = 'analog-output-speaker',
  HEADPHONES = 'analog-output-headphones',
}

/**
 * Sets the active audio output port.
 * NOTE: This is only guaranteed to work on production hardware.
 */
async function setAudioOutputFn(outputName: AudioOutput): Promise<void> {
  if (getNodeEnv() !== 'production') {
    return;
  }

  let errorOutput: string;

  try {
    ({ stderr: errorOutput } = await execFile('sudo', [
      '/vx/code/app-scripts/pactl.sh',
      'set-sink-port',
      PULSE_AUDIO_SINK_ID_VSAP_SOUND_CARD,
      outputName,
    ]));
  } catch (error) {
    throw new Error(`Unable to set audio output: ${error}}`);
  }

  if (errorOutput) {
    throw new Error(`Unable to set audio output: ${errorOutput}}`);
  }
}

/**
 * Sets the active audio output port.
 * NOTE: This is only guaranteed to work on production hardware.
 */
export async function setAudioOutput(
  outputName: AudioOutput,
  logger: Logger
): Promise<void> {
  const baseWaitTimeMs = 1000;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let lastError: any;
  for (let i = 0; i < MAX_PULSE_COMMAND_ATTEMPTS; i += 1) {
    if (i > 0) {
      void logger.log(LogEventId.Info, 'system', {
        message:
          `Unable to set audio output to ${outputName} - ` +
          `retrying after error: ${lastError}`,
      });
      await sleep(baseWaitTimeMs * i);
    }

    try {
      return await setAudioOutputFn(outputName);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
}
