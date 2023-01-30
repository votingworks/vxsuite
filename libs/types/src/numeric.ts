import { z } from 'zod';
import { Result } from '@votingworks/basics';
import { safeParse } from './generic';

export interface SafeParseNumberOptions {
  min?: number;
  max?: number;
}

function constrain(
  schema: z.ZodNumber,
  { min, max }: SafeParseNumberOptions
): z.ZodSchema<number> {
  if (typeof min === 'number') {
    return constrain(schema.min(min), { max });
  }

  if (typeof max === 'number') {
    return constrain(schema.max(max), { min });
  }

  return schema.refine(
    (value) => Number.isFinite(value),
    'Infinity is not allowed'
  );
}

function doParse(
  schema: z.ZodSchema<number>,
  valueToParse: unknown
): Result<number, z.ZodError> {
  // eslint-disable-next-line vx/gts-safe-number-parse
  return safeParse(schema, Number(valueToParse));
}

/**
 * A safer `Number` type-coercion function. Rejects `NaN` and `Infinity` as
 * unlikely to be expected number values.
 *
 * @example
 *
 *   safeParseNumber(0);        // ok(0)
 *   safeParseNumber('3.14');   // ok(3.14)
 *   safeParseNumber({});       // err(…)
 *   safeParseNumber(Infinity); // err(…)
 */
export function safeParseNumber(
  valueToParse: unknown,
  options: SafeParseNumberOptions = {}
): Result<number, z.ZodError> {
  return doParse(constrain(z.number(), options), valueToParse);
}

/**
 * A safer `parseInt`. Rejects `NaN` and `Infinity` as unlikely to be expected
 * number values.
 *
 * @example
 *
 *   safeParseInt(0);     // ok(0)
 *   safeParseInt('0');   // ok(0)
 *   safeParseInt({});    // err(…)
 *   safeParseInt(3.14);  // err(…)
 */
export function safeParseInt(
  valueToParse: unknown,
  options: SafeParseNumberOptions = {}
): Result<number, z.ZodError> {
  return doParse(constrain(z.number().int(), options), valueToParse);
}
