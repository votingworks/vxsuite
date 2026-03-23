import { z } from 'zod/v4';

import { assertDefined, err, ok, Result, sleep } from '@votingworks/basics';
import { safeParse, safeParseJson } from '@votingworks/types';

import { LogEventId, Logger } from '@votingworks/logging';
import { NODE_ENV } from '../scan_globals';
import { pactl } from './pulse_audio';

const PactlListCardsSchema = z.array(z.object({ name: z.string() }));

/** {@link getAudioCardName} params. */
export interface GetAudioCardNameParams {
  logger: Logger;
  maxRetries?: number;
  nodeEnv: typeof NODE_ENV;
}

/** The device name for the default audio card. */
export async function getAudioCardName(
  p: GetAudioCardNameParams
): Promise<Result<string, string | z.ZodError>> {
  const maxAttempts = 1 + (p.maxRetries || 0);
  const baseWaitTimeMs = 1000;

  let lastError: string | undefined;
  for (let i = 0; i < maxAttempts; i += 1) {
    if (i > 0) {
      p.logger.log(LogEventId.UnknownError, 'system', {
        disposition: 'failure',
        message: `Audio card detection failed - retrying after error: ${lastError}`,
      });

      await sleep(baseWaitTimeMs * i);
    }

    const args = ['-fjson', 'list', 'cards'];
    const cmdResult = await pactl(p.nodeEnv, p.logger, args);

    if (cmdResult.isErr()) {
      lastError = cmdResult.err();
      continue;
    }

    const nameResult = parseCardName(cmdResult.ok());
    if (nameResult.isErr()) return nameResult;

    p.logger.log(LogEventId.Info, 'system', {
      disposition: 'success',
      message: `audio card detected: ${nameResult.ok()}`,
    });

    return nameResult;
  }

  return err(assertDefined(lastError));
}

function parseCardName(
  responseJson: string
): Result<string, string | z.ZodError> {
  const parsed = safeParseJson(responseJson);
  if (parsed.isErr()) {
    return err(`unable to parse pactl response: ${parsed.err()}`);
  }

  const validation = safeParse(PactlListCardsSchema, parsed.ok());
  if (validation.isErr()) return validation;

  const defaultCard = validation.ok()[0];
  if (!defaultCard) return err('pactl list cards: no audio cards found');

  return ok(defaultCard.name);
}
