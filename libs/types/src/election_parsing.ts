import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { type Result, DateWithoutTime, err, ok } from '@votingworks/basics';
import type { z } from 'zod/v4';
import { safeParseCdfBallotDefinition } from './cdf/ballot-definition/convert.js';
import type * as Cdf from './cdf/ballot-definition/index.js';
import { type Election, ElectionSchema } from './election.js';
import { safeParse, safeParseJson } from './generic.js';

/**
 * Parses `value` as a VXF `Election` object.
 */
export function safeParseVxfElection(
  value: unknown
): Result<Election, z.ZodError> {
  return safeParse(ElectionSchema, value);
}

function prettyZodError(error: z.ZodError): string {
  return error.issues
    .map((issue) => `- ${issue.path.join('.')}: ${issue.message}`)
    .join('\n');
}

/**
 * Parses `value` as an `Election` object. Supports both VXF and CDF. If given a
 * string, will attempt to parse it as JSON first.
 */
function safeParseElectionExtended(value: unknown): Result<
  {
    vxfElection: Election;
    cdfElection?: Cdf.BallotDefinition;
  },
  Error | SyntaxError
> {
  if (typeof value === 'string') {
    const parsed = safeParseJson(value);
    if (parsed.isErr()) {
      return parsed;
    }
    return safeParseElectionExtended(parsed.ok());
  }

  if (Buffer.isBuffer(value)) {
    return safeParseElectionExtended(value.toString('utf-8'));
  }

  const vxfResult = safeParseVxfElection(value);
  if (vxfResult.isOk()) {
    return ok({ vxfElection: vxfResult.ok() });
  }

  const cdfResult = safeParseCdfBallotDefinition(value);
  if (cdfResult.isOk()) {
    return cdfResult;
  }

  const isProbablyCdf = typeof value === 'object' && value && '@type' in value;

  return err(
    new Error(
      isProbablyCdf
        ? `Invalid CDF election:\n${cdfResult.err()}`
        : `Invalid election:\n${prettyZodError(vxfResult.err())}`
    )
  );
}

/**
 * Parses `value` as an `Election` object. Supports both VXF and CDF. If given a
 * string, will attempt to parse it as JSON first.
 */
export function safeParseElection(
  value: unknown
): Result<Election, Error | SyntaxError> {
  const result = safeParseElectionExtended(value);

  if (result.isErr()) {
    return err(result.err());
  }

  return ok(result.ok().vxfElection);
}

/** Deserializes an `Election` that was validated before `JSON.stringify`. */
export function parseValidatedElection(json: string): Election {
  const value = JSON.parse(json) as Omit<Election, 'date'> & { date: string };
  return { ...value, date: new DateWithoutTime(value.date) };
}

export function hashElectionData(data: string | Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

const STRICT_TEXT_DECODER = new TextDecoder('utf-8', {
  fatal: true,
  // eslint-disable-next-line vx/gts-identifiers
  ignoreBOM: true,
});

/**
 * Decodes an election file, failing on anything that would not re-encode to
 * the same bytes (invalid UTF-8). A byte order mark is kept, so it fails to
 * parse as JSON rather than being silently dropped from the hashed text.
 */
export function decodeElectionData(
  bytes: Uint8Array
): Result<string, TypeError> {
  try {
    return ok(STRICT_TEXT_DECODER.decode(bytes));
  } catch (error) {
    return err(error as TypeError);
  }
}
