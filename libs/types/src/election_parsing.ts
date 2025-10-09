import {
  Result,
  err,
  ok,
  DateWithoutTime,
  extractErrorMessage,
} from '@votingworks/basics';
import { sha256 } from 'js-sha256';
import { z } from 'zod/v4';
import { safeParseCdfBallotDefinition } from './cdf/ballot-definition/convert';
import * as Cdf from './cdf/ballot-definition';
import { Election, ElectionDefinition, ElectionSchema } from './election';
import { safeParse, safeParseJson } from './generic';

/**
 * Parse the date field of an Election object from a string to a
 * DateWithoutTime.
 */
function parseElectionDate(value: unknown): Result<unknown, z.ZodError> {
  if (!value || typeof value !== 'object') {
    return ok(value);
  }

  // We're casting it here to make it easier to use, but in this function you
  // must assume the type is unknown.
  let election = value as Election;

  if (election.date && typeof election.date === 'string') {
    try {
      election = { ...election, date: new DateWithoutTime(election.date) };
    } catch (error) {
      return err(
        new z.ZodError([
          {
            code: 'custom',
            message: extractErrorMessage(error),
            path: ['date'],
            input: election.date,
          },
        ])
      );
    }
  }

  return ok(election);
}

/**
 * Parses `value` as a VXF `Election` object.
 */
export function safeParseVxfElection(
  value: unknown
): Result<Election, z.ZodError> {
  const valueWithParsedDate = parseElectionDate(value);
  if (valueWithParsedDate.isErr()) {
    return valueWithParsedDate;
  }
  return safeParse(ElectionSchema, valueWithParsedDate.ok());
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

  return err(
    new Error(
      [
        'Invalid election definition',
        `VXF error: ${vxfResult.err()}`,
        `CDF error: ${cdfResult.err()}`,
      ].join('\n\n')
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

interface ExtendedElectionDefinition {
  cdfElection?: Cdf.BallotDefinition;
  electionDefinition: ElectionDefinition;
}

/**
 * Parses `value` as a JSON `Election`, computing the ballot hash if the
 * result is `Ok`.
 */
function safeParseElectionDefinitionExtended(
  value: string
): Result<ExtendedElectionDefinition, z.ZodError | SyntaxError> {
  const result = safeParseElectionExtended(value);
  return result.isErr()
    ? result
    : ok({
        cdfElection: result.ok().cdfElection,
        electionDefinition: {
          election: result.ok().vxfElection,
          electionData: value,
          ballotHash: sha256(value),
        },
      });
}

/**
 * Parses `value` as a JSON `Election`, computing the ballot hash if the
 * result is `Ok`.
 */
export function safeParseElectionDefinition(
  value: string
): Result<ElectionDefinition, z.ZodError | SyntaxError> {
  const result = safeParseElectionDefinitionExtended(value);

  return result.isErr() ? result : ok(result.ok().electionDefinition);
}
