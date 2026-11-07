import { type Result, DateWithoutTime, err, ok } from '@votingworks/basics';
import type { z } from 'zod/v4';
import { sha256 } from './sha256.js';
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

/**
 * Parses election data that already passed {@link safeParseElection} when it
 * was imported, skipping validation for VXF elections.
 */
export function parseValidatedElection(electionData: string): Election {
  const value = JSON.parse(electionData) as Omit<Election, 'date'> & {
    date: string;
  };
  if ('@type' in value) {
    return safeParseElection(electionData).unsafeUnwrap();
  }
  return { ...value, date: new DateWithoutTime(value.date) };
}

// @coverage-exclude: trivial, tested via consumers.
export function hashElectionData(data: string): string {
  return sha256(data);
}
