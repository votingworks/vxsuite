import {
  Result,
  err,
  ok,
  assertDefined,
  find,
  DateWithoutTime,
  extractErrorMessage,
} from '@votingworks/basics';
import { sha256 } from 'js-sha256';
import { z } from 'zod';
import { safeParseCdfBallotDefinition } from './cdf/ballot-definition/convert';
import * as Cdf from './cdf/ballot-definition';
import {
  HmpbBallotPaperSize,
  Candidate,
  Election,
  ElectionDefinition,
  ElectionSchema,
  PartyId,
} from './election';
import { safeParse, safeParseJson } from './generic';

/**
 * Support old versions of the election definition format.
 */
/* istanbul ignore next */
function maintainBackwardsCompatibility(value: unknown): unknown {
  if (!value || typeof value !== 'object') {
    return value;
  }

  // We're casting it here to make it easier to use, but in this function you
  // must assume the type is unknown.
  let election = value as Election;

  // Fill in a default empty seal value
  election = { ...election, seal: election.seal ?? '' };

  // Fill in `Party#fullName` from `Party#name` if it's missing.
  const isMissingPartyFullName = election.parties?.some(
    /* istanbul ignore next */
    (party) => !party?.fullName
  );

  /* istanbul ignore next */
  if (isMissingPartyFullName) {
    election = {
      ...election,
      parties: election.parties?.map((party) =>
        !party
          ? party
          : {
              ...party,
              fullName: party.fullName ?? party.name,
            }
      ),
    };
  }

  if (election.contests) {
    // Handle single `partyId` on candidates.
    interface CandidateWithPartyId extends Candidate {
      readonly partyId?: PartyId;
    }

    const hasPartyId = election.contests.some(
      (contest) =>
        /* istanbul ignore next */
        contest?.type === 'candidate' &&
        contest.candidates.some(
          (candidate: CandidateWithPartyId) => candidate?.partyId
        )
    );

    if (hasPartyId) {
      election = {
        ...election,
        contests: election.contests.map((contest) => {
          /* istanbul ignore next */
          if (contest?.type !== 'candidate' || !contest.candidates) {
            return contest;
          }

          return {
            ...contest,
            candidates: contest.candidates.map(
              (candidate: CandidateWithPartyId) => {
                /* istanbul ignore next */
                if (!candidate?.partyId) {
                  return candidate;
                }

                return {
                  ...candidate,
                  partyIds: [candidate.partyId],
                };
              }
            ),
          };
        }),
      };
    }

    // Fill in required contest yesOption/noOption
    const contests = election.contests.map((contest) => {
      if (contest.type !== 'yesno') return contest;
      return {
        ...contest,
        yesOption: contest.yesOption ?? {
          label: 'Yes',
          id: `${contest.id}-option-yes`,
        },
        noOption: contest.noOption ?? {
          label: 'No',
          id: `${contest.id}-option-no`,
        },
      };
    });
    election = {
      ...election,
      contests,
    };
    /* istanbul ignore next */
    if ('gridLayouts' in election) {
      election = {
        ...election,
        gridLayouts: assertDefined(election.gridLayouts).map((gridLayout) => ({
          ...gridLayout,
          gridPositions: gridLayout.gridPositions.map((gridPosition) => {
            const contest = find(
              contests,
              (c) => c.id === gridPosition.contestId
            );
            if (contest.type !== 'yesno' || gridPosition.type !== 'option') {
              return gridPosition;
            }
            return {
              ...gridPosition,
              optionId:
                gridPosition.optionId === 'yes'
                  ? contest.yesOption.id
                  : gridPosition.optionId === 'no'
                  ? contest.noOption.id
                  : gridPosition.optionId,
            };
          }),
        })),
      };
    }
  }

  if (!('ballotLayout' in election)) {
    election = {
      ...(election as Election),
      ballotLayout: {
        paperSize: HmpbBallotPaperSize.Letter,
        metadataEncoding: 'qr-code',
      },
    };
  }

  // Add sheetNumber to grid positions
  /* istanbul ignore next */
  if (election.gridLayouts) {
    election = {
      ...election,
      gridLayouts: election.gridLayouts.map((gridLayout) => ({
        ...gridLayout,
        gridPositions: gridLayout.gridPositions.map((gridPosition) => ({
          ...gridPosition,
          sheetNumber: gridPosition.sheetNumber ?? 1,
        })),
      })),
    };
  }

  // Add election.type
  if (!('type' in election)) {
    election = {
      ...(election as Election),
      type: (election as Election).contests?.some(
        (contest) => contest.type === 'candidate' && contest.partyId
      )
        ? 'primary'
        : 'general',
    };
  }

  return election;
}

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
  const valueWithParsedDate = parseElectionDate(
    maintainBackwardsCompatibility(value)
  );
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
