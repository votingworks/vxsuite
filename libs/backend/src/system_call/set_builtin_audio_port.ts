import { sleep } from '@votingworks/basics';
import { LogEventId, Logger } from '@votingworks/logging';
import { execFile } from '../exec';
import type { NODE_ENV } from '../scan_globals';

const PULSE_AUDIO_SINK_ID_BUILTIN_SOUND_CARD = '0';

/**
 * Audio output port names for builtin sound card. These are fairly
 * hardware-specific and not guaranteed to work in other environments.
 */
export enum AudioPort {
  SPEAKER = 'analog-output-speaker',
  HEADPHONES = 'analog-output-headphones',
}

/**
 * Sets the active audio output port.
 * NOTE: This is only guaranteed to work on production hardware.
 */
async function impl(
  nodeEnv: typeof NODE_ENV,
  portName: AudioPort
): Promise<void> {
  if (nodeEnv !== 'production') {
    return;
  }

  let errorOutput: string;

  try {
    ({ stderr: errorOutput } = await execFile('sudo', [
      '/vx/code/app-scripts/pactl.sh',
      'set-sink-port',
      PULSE_AUDIO_SINK_ID_BUILTIN_SOUND_CARD,
      portName,
    ]));
  } catch (error) {
    throw new Error(`Unable to set builtin audio port: ${error}}`);
  }

  if (errorOutput) {
    throw new Error(`Unable to set builtin audio port: ${errorOutput}}`);
  }
}

/**
 * Sets the active audio output port.
 * NOTE: This is only guaranteed to work on production hardware.
 */
export async function setBuiltinAudioPort(
  nodeEnv: typeof NODE_ENV,
  portName: AudioPort,
  logger: Logger,
  opts: {
    maxRetries?: number;
  } = {}
): Promise<void> {
  const { maxRetries = 0 } = opts;
  const maxAttempts = 1 + maxRetries;
  const baseWaitTimeMs = 1000;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let lastError: any;
  for (let i = 0; i < maxAttempts; i += 1) {
    if (i > 0) {
      logger.log(LogEventId.Info, 'system', {
        message:
          `Unable to set audio output to ${portName} - ` +
          `retrying after error: ${lastError}`,
      });
      await sleep(baseWaitTimeMs * i);
    }

    try {
      return await impl(nodeEnv, portName);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
}
