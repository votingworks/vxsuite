/**
 * Defines election arbitraries for `fast-check` property tests.
 */

import fc from 'fast-check';
import { DateTime } from 'luxon';
import {
  BallotLayout,
  BallotPaperSize,
  BallotStyle,
  Candidate,
  CandidateContest,
  CastVoteRecord,
  Contests,
  County,
  District,
  Election,
  ElectionDefinition,
  Id,
  MsEitherNeitherContest,
  Party,
  Precinct,
  YesNoContest,
  YesNoOption,
} from '@votingworks/types';
import { createHash } from 'crypto';

// We're only importing this for the types and we can't use `import type`.
// eslint-disable-next-line import/no-extraneous-dependencies
import { z } from 'zod';

/**
 * Wraps another arbitrary, making the value possibly missing.
 */
export function arbitraryOptional<T>(
  arbitrary: fc.Arbitrary<T>
): fc.Arbitrary<T | undefined> {
  return fc.oneof(fc.constant(undefined), arbitrary);
}

function hasUniqueIds<T extends { id: z.TypeOf<typeof Id> }>(
  values: readonly T[]
): boolean {
  return new Set(values.map(({ id }) => id)).size === values.length;
}

/**
 * Builds values suitable for use as IDs.
 */
export function arbitraryId(): fc.Arbitrary<z.TypeOf<typeof Id>> {
  return (
    fc
      .stringOf(fc.constantFrom(...'0123456789abcdefghijklmnopqrstuvwxyz-_'), {
        minLength: 1,
      })
      // make sure IDs don't start with underscore
      .map((value) => (value.startsWith('_') ? `0${value}` : value))
  );
}

export function arbitraryDateTime({
  minYear,
  maxYear,
  zoneName,
}: {
  minYear?: number;
  maxYear?: number;
  zoneName?: DateTime['zoneName'];
} = {}): fc.Arbitrary<DateTime> {
  return fc
    .record({
      year: fc.integer({ min: minYear, max: maxYear }),
      month: fc.integer({ min: 1, max: 12 }),
      day: fc.integer({ min: 1, max: 31 }),
      hour: fc.integer({ min: 0, max: 23 }),
      minute: fc.integer({ min: 0, max: 59 }),
      second: fc.integer({ min: 0, max: 59 }),
    })
    .map((parts) => {
      try {
        const result = DateTime.fromObject({ ...parts, zone: zoneName });
        if (
          result.year === parts.year &&
          result.month === parts.month &&
          result.day === parts.day &&
          result.hour === parts.hour &&
          result.minute === parts.minute &&
          result.second === parts.second
        ) {
          return result;
        }
      } catch {
        // ignore invalid dates
      }
      return undefined;
    })
    .filter((dateTime): dateTime is DateTime => !!dateTime);
}

/**
 * Builds values for use as "yes" or "no" options on ballots.
 */
export function arbitraryYesNoOption({
  id,
}: { id?: fc.Arbitrary<YesNoOption['id']> } = {}): fc.Arbitrary<YesNoOption> {
  return (id ?? fc.constantFrom('yes', 'no')).chain((yesNoID) =>
    fc.record({
      id: fc.constant(yesNoID),
      label:
        yesNoID === 'yes'
          ? fc.constantFrom('Yes', 'Yep', 'Uh-huh')
          : yesNoID === 'no'
          ? fc.constantFrom('No', 'Nope', 'Nuh-uh')
          : fc.string({ minLength: 1 }),
    })
  );
}

/**
 * Builds values for yes/no contests.
 */
export function arbitraryYesNoContest({
  id = arbitraryId(),
  districtId = arbitraryId(),
  partyId = arbitraryOptional(arbitraryId()),
}: {
  id?: fc.Arbitrary<YesNoContest['id']>;
  districtId?: fc.Arbitrary<District['id']>;
  partyId?: fc.Arbitrary<Party['id'] | undefined>;
} = {}): fc.Arbitrary<YesNoContest> {
  return fc.boolean().chain((hasCustomOptions) =>
    fc.record({
      type: fc.constant('yesno'),
      title: fc.string({ minLength: 1 }),
      shortTitle: fc.string({ minLength: 1 }),
      section: fc.string({ minLength: 1 }),
      description: fc.string({ minLength: 1 }),
      id,
      districtId,
      partyId,
      yesOption: hasCustomOptions
        ? arbitraryYesNoOption({ id: fc.constant('yes') })
        : fc.constant(undefined),
      noOption: hasCustomOptions
        ? arbitraryYesNoOption({ id: fc.constant('no') })
        : fc.constant(undefined),
    })
  );
}

/**
 * Builds candidate values for candidate contests.
 */
export function arbitraryCandidate({
  id = arbitraryId(),
  partyId = fc.constant(undefined),
}: {
  id?: fc.Arbitrary<Candidate['id']>;
  partyId?: fc.Arbitrary<Party['id'] | undefined>;
} = {}): fc.Arbitrary<Candidate> {
  return fc.record({
    id,
    name: fc.string({ minLength: 1 }),
    isWriteIn: arbitraryOptional(fc.boolean()),
    partyId,
  });
}

/**
 * Builds values for candidate contest.
 */
export function arbitraryCandidateContest({
  id = arbitraryId(),
  districtId = arbitraryId(),
  partyIds = fc.array(arbitraryId(), { minLength: 1 }),
}: {
  id?: fc.Arbitrary<CandidateContest['id']>;
  districtId?: fc.Arbitrary<District['id']>;
  partyIds?: fc.Arbitrary<Array<Party['id']>>;
} = {}): fc.Arbitrary<CandidateContest> {
  return fc.record({
    type: fc.constant('candidate'),
    id,
    title: fc.string({ minLength: 1 }),
    section: fc.string({ minLength: 1 }),
    districtId,
    allowWriteIns: fc.boolean(),
    seats: fc.integer({ min: 1, max: 5 }),
    candidates: fc
      .array(
        partyIds
          .chain((ids) =>
            ids.length ? fc.constantFrom(...ids) : fc.constant(undefined)
          )
          .chain((partyId) =>
            arbitraryCandidate({ partyId: fc.constant(partyId) })
          )
      )
      .filter(hasUniqueIds),
  });
}

export function arbitraryMsEitherNeitherContest({
  districtId = arbitraryId(),
}: {
  districtId?: fc.Arbitrary<District['id']>;
} = {}): fc.Arbitrary<MsEitherNeitherContest> {
  return fc.record({
    type: fc.constant('ms-either-neither'),
    id: arbitraryId(),
    title: fc.string({ minLength: 1 }),
    section: fc.string({ minLength: 1 }),
    description: fc.string({ minLength: 1 }),
    districtId,
    eitherNeitherContestId: arbitraryId(),
    eitherNeitherLabel: fc.string({ minLength: 1 }),
    eitherOption: arbitraryYesNoOption(),
    neitherOption: arbitraryYesNoOption(),
    pickOneContestId: arbitraryId(),
    firstOption: arbitraryYesNoOption(),
    secondOption: arbitraryYesNoOption(),
    pickOneLabel: fc.string({ minLength: 1 }),
  });
}

export function arbitraryContests({
  partyIds,
}: {
  partyIds?: fc.Arbitrary<Array<Party['id']>>;
} = {}): fc.Arbitrary<Contests> {
  return fc
    .tuple(
      fc.array(arbitraryCandidateContest({ partyIds })),
      fc.array(
        fc.oneof(arbitraryYesNoContest(), arbitraryMsEitherNeitherContest())
      )
    )
    .map(([candidateContests, otherContests]) => [
      ...candidateContests,
      ...otherContests,
    ])
    .filter((contests) => contests.length > 0)
    .filter(hasUniqueIds);
}

export function arbitraryDistrict({
  id = arbitraryId(),
}: { id?: fc.Arbitrary<District['id']> } = {}): fc.Arbitrary<District> {
  return fc.record({
    id,
    name: fc.string({ minLength: 1 }),
  });
}

export function arbitraryPrecinct({
  id = arbitraryId(),
}: { id?: fc.Arbitrary<Precinct['id']> } = {}): fc.Arbitrary<Precinct> {
  return fc.record({
    id,
    name: fc.string({ minLength: 1 }),
  });
}

export function arbitraryBallotStyle({
  id = arbitraryId(),
  districtIds = fc.array(arbitraryId()),
  precinctIds = fc.array(arbitraryId()),
}: {
  id?: fc.Arbitrary<BallotStyle['id']>;
  districtIds?: fc.Arbitrary<Array<District['id']>>;
  precinctIds?: fc.Arbitrary<Array<Precinct['id']>>;
} = {}): fc.Arbitrary<BallotStyle> {
  return fc.record({
    id,
    districts: districtIds,
    precincts: precinctIds,
  });
}

export function arbitraryCounty({
  id = arbitraryId(),
}: { id?: fc.Arbitrary<County['id']> } = {}): fc.Arbitrary<County> {
  return fc.record({ id, name: fc.string({ minLength: 1 }) });
}

export function arbitraryParty({
  id = arbitraryId(),
}: { id?: fc.Arbitrary<Party['id']> } = {}): fc.Arbitrary<Party> {
  return fc
    .record({
      id,
      abbrev: fc.string({ minLength: 1 }),
      name: fc.string({ minLength: 1 }),
    })
    .map((party) => ({ ...party, fullName: `${party.name} Party` }));
}

export function arbitraryBallotLayout(): fc.Arbitrary<BallotLayout> {
  return fc.record({
    paperSize: fc.constantFrom(...Object.values(BallotPaperSize)),
  });
}

export function arbitraryElection(): fc.Arbitrary<Election> {
  return (
    fc
      .record({
        districts: fc
          .array(arbitraryDistrict(), { minLength: 1 })
          .filter(hasUniqueIds),
        precincts: fc
          .array(arbitraryPrecinct(), { minLength: 1 })
          .filter(hasUniqueIds),
        parties: fc.array(arbitraryParty()).filter(hasUniqueIds),
      })
      .chain(({ districts, precincts, parties }) =>
        fc.record<Election>({
          title: fc.string({ minLength: 1 }),
          county: arbitraryCounty(),
          state: fc.string({ minLength: 2, maxLength: 2 }),
          date: fc.date().map((date) => date.toISOString()),
          parties: fc.constant(parties),
          contests: arbitraryContests({
            partyIds: fc.constant(parties.map(({ id }) => id)),
          }),
          ballotStyles: fc
            .array(
              arbitraryBallotStyle({
                districtIds: fc
                  .shuffledSubarray(districts, { minLength: 1 })
                  .map((values) => values.map(({ id }) => id)),
                precinctIds: fc
                  .shuffledSubarray(precincts, { minLength: 1 })
                  .map((values) => values.map(({ id }) => id)),
              }),
              { minLength: 1 }
            )
            .filter(hasUniqueIds),
          districts: fc.constant(districts),
          precincts: fc.constant(precincts),
          ballotLayout: arbitraryBallotLayout(),
        })
      )
      // performing a shrink on this data structure takes forever
      .noShrink()
  );
}

/**
 * Build an entire valid election definition.
 *
 * @example
 *
 *   test('rendering ballots does not crash', () => {
 *     fc.assert(
 *       fc.property(
 *         arbitraryElectionDefinition(),
 *         (electionDefinition) => {
 *           render(
 *             <HandMarkedPaperBallot
 *               electionDefinition={electionDefinition}
 *             />
 *           )
 *           screen.getByText(electionDefinition.election.title)
 *         }
 *       )
 *     )
 *   })
 */
export function arbitraryElectionDefinition(): fc.Arbitrary<ElectionDefinition> {
  return arbitraryElection()
    .map((election) => ({
      election,
      electionData: JSON.stringify(election, undefined, 2),
    }))
    .map(({ election, electionData }) => ({
      election,
      electionData,
      electionHash: createHash('sha256').update(electionData).digest('hex'),
    }));
}

/**
 * Builds valid cast-vote records. To build multiple for a single election,
 * you may find it easier to use {@see arbitraryCastVoteRecords}.
 */
export function arbitraryCastVoteRecord({
  election = arbitraryElection(),
  testBallot = fc.boolean(),
}: {
  election?: fc.Arbitrary<Election>;
  testBallot?: fc.Arbitrary<boolean>;
} = {}): fc.Arbitrary<CastVoteRecord> {
  return election.chain((e) =>
    fc.record({
      _precinctId: fc.constantFrom(...e.precincts.map(({ id }) => id)),
      _ballotId: arbitraryId(),
      _ballotStyleId: fc.constantFrom(...e.ballotStyles.map(({ id }) => id)),
      _ballotType: fc.constantFrom('absentee', 'provisional', 'standard'),
      _batchId: arbitraryId(),
      _batchLabel: fc.string({ minLength: 1 }),
      _testBallot: testBallot,
      _scannerId: arbitraryId(),
      _pageNumbers: fc
        .integer({ min: 0, max: 3 })
        .map((index) => [index * 2 + 1, index * 2 + 2]),
      _locales: arbitraryOptional(
        fc.record({ primary: fc.constantFrom('en-US') })
      ),
    })
  );
}

/**
 * Builds valid cast-vote record lists given an election and test/live setting.
 */
export function arbitraryCastVoteRecords({
  election,
  testBallot,
  minLength,
  maxLength,
}: {
  election: Election;
  testBallot: boolean;
  minLength?: number;
  maxLength?: number;
}): fc.Arbitrary<CastVoteRecord[]> {
  return fc.array(
    arbitraryCastVoteRecord({
      election: fc.constant(election),
      testBallot: fc.constant(testBallot),
    }),
    { minLength, maxLength }
  );
}
