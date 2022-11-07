import { safeParseJson } from '@votingworks/types';
import * as z from 'zod';

import { ErrorsResponse, OkResponse } from './base';

/**
 * A Fetch wrapper for API clients that accepts an API response schema for
 * parsing and validating server responses.
 */
export async function fetchWithSchema<T extends OkResponse | ErrorsResponse>(
  responseSchema: z.ZodType<T>,
  input: RequestInfo,
  init?: RequestInit
): Promise<T> {
  const response = await fetch(input, {
    ...(init ?? {}),
    headers: {
      Accept: 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  const responseText: string = await response.text();

  const jsonParseResult = safeParseJson(responseText);
  if (jsonParseResult.isErr()) {
    throw new Error(
      `invalid JSON received: '${responseText}' | status code: ${response.status}`
    );
  }

  const responseJson = jsonParseResult.ok();
  const parseResult = responseSchema.safeParse(responseJson);
  if (!parseResult.success) {
    throw new Error(
      `invalid response received: ${parseResult.error} | status code: ${response.status}`
    );
  }

  return parseResult.data;
}
