import { err, ok, Result, wrapException } from '@votingworks/basics';
import { z } from 'zod';

function safeParse<T>(
  parser: z.ZodType<T>,
  value: unknown
): Result<T, z.ZodError> {
  const result = parser.safeParse(value);

  if (!result.success) {
    return err(result.error);
  }

  return ok(result.data);
}

/**
 * Parse JSON and then validate the result with `parser`.
 */
export function safeParseJson<T>(
  text: string,
  parser?: z.ZodType<T>
): Result<T | unknown, z.ZodError | SyntaxError> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return wrapException(error);
  }

  return parser ? safeParse(parser, parsed) : ok(parsed);
}
