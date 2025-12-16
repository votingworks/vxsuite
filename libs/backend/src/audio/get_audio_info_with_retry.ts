import { sleep } from '@votingworks/basics';
import { LogEventId, Logger } from '@votingworks/logging';
import * as audio from '../system_call/get_audio_info';

/**
 * Audio info with a guaranteed builtin audio device.
 */
export type AudioInfoWithBuiltin = audio.AudioInfo & {
  builtin: audio.BuiltinAudio;
};

/**
 * Options for configuring audio info retry behavior.
 */
export interface GetAudioInfoWithRetryOptions {
  /**
   * Initial delay before the first retry. Will be increased for each successive
   * retry.
   */
  baseRetryDelayMs: number;
  logger: Logger;
  nodeEnv: 'production' | 'development' | 'test';
  maxAttempts: number;
}

/**
 * Intended to be run at machine startup. Since the PulseAudio service may not
 * be fully up and running yet, we retry with increasing wait times until
 * `maxAttempts` is reached.
 */
export async function getAudioInfoWithRetry(
  ctx: GetAudioInfoWithRetryOptions
): Promise<AudioInfoWithBuiltin> {
  let lastError: unknown;
  for (let i = 0; i < ctx.maxAttempts; i += 1) {
    if (i > 0) {
      ctx.logger.log(LogEventId.Info, 'system', {
        message:
          `Unable to get audio device info - ` +
          `retrying after error: ${lastError}`,
      });
      await sleep(ctx.baseRetryDelayMs * i);
    }

    try {
      const audioInfo = await audio.getAudioInfo(ctx);

      if (!audioInfo.builtin) {
        lastError = new Error('builtin audio device not found');
        continue;
      }

      return audioInfo as AudioInfoWithBuiltin;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
}
