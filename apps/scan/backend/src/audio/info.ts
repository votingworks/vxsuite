import { audio } from '@votingworks/backend';
import { sleep } from '@votingworks/basics';
import { LogEventId, Logger } from '@votingworks/logging';
import { NODE_ENV } from '../globals';

type ScanAudioInfo = audio.AudioInfo & {
  builtin: audio.BuiltinAudio;
};

/**
 * Intended to be run at machine startup. Since the PulseAudio service may not
 * be fully up and running yet, we retry with increasing wait times until
 * `ctx.maxAttempts` is reached.
 */
export async function getAudioInfo(ctx: {
  /**
   * Initial delay before the first retry. Will be increased for each successive
   * retry.
   */
  baseRetryDelayMs: number;
  logger: Logger;
  nodeEnv: typeof NODE_ENV;
  maxAttempts: number;
}): Promise<ScanAudioInfo> {
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

      return audioInfo as ScanAudioInfo;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
}
