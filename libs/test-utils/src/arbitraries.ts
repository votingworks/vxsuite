/**
 * Defines election arbitraries for `fast-check` property tests.
 */

import fc from 'fast-check';
import { DateTime } from 'luxon';
import {
  BallotId,
  BallotLayout,
  BallotLocale,
  BallotPaperSize,
  BallotStyle,
  BallotStyleId,
  Candidate,
  CandidateContest,
  CandidateId,
  CastVoteRecord,
  ContestId,
  Contests,
  County,
  CountyId,
  District,
  DistrictId,
  Election,
  ElectionDefinition,
  Id,
  MsEitherNeitherContest,
  Party,
  PartyId,
  Precinct,
  PrecinctId,
  YesNoContest,
  YesNoOption,
} from '@votingworks/types';
import { sha256 } from 'js-sha256';

/**
 * Wraps another arbitrary, making the value possibly missing.
 */
export function arbitraryOptional<T>(
  arbitrary: fc.Arbitrary<T>
): fc.Arbitrary<T | undefined> {
  return fc.oneof(fc.constant(undefined), arbitrary);
}

function hasUniqueIds<T extends { id: Id }>(values: readonly T[]): boolean {
  return new Set(values.map(({ id }) => id)).size === values.length;
}

/**
 * Builds values suitable for use as IDs.
 */
export function arbitraryId(): fc.Arbitrary<Id> {
  return (
    fc
      .stringOf(fc.constantFrom(...'0123456789abcdefghijklmnopqrstuvwxyz-_'), {
        minLength: 1,
      })
      // make sure IDs don't start with underscore
      .map((value) => (value.startsWith('_') ? `0${value}` : value))
  );
}

/**
 * Builds values suitable for ballot style IDs.
 */
export function arbitraryBallotId(): fc.Arbitrary<BallotId> {
  return arbitraryId() as fc.Arbitrary<BallotId>;
}

/**
 * Builds values suitable for ballot style IDs.
 */
export function arbitraryBallotStyleId(): fc.Arbitrary<BallotStyleId> {
  return arbitraryId();
}

/**
 * Builds values suitable for candidate IDs.
 */
export function arbitraryCandidateId(): fc.Arbitrary<CandidateId> {
  return arbitraryId();
}

/**
 * Builds values suitable for contest IDs.
 */
export function arbitraryContestId(): fc.Arbitrary<ContestId> {
  return arbitraryId();
}

/**
 * Builds values suitable for county IDs.
 */
export function arbitraryCountyId(): fc.Arbitrary<CountyId> {
  return arbitraryId();
}

/**
 * Builds values suitable for district IDs.
 */
export function arbitraryDistrictId(): fc.Arbitrary<DistrictId> {
  return arbitraryId() as fc.Arbitrary<DistrictId>;
}

/**
 * Builds values suitable for party IDs.
 */
export function arbitraryPartyId(): fc.Arbitrary<PartyId> {
  return arbitraryId() as fc.Arbitrary<PartyId>;
}

/**
 * Builds values suitable for precinct IDs.
 */
export function arbitraryPrecinctId(): fc.Arbitrary<PrecinctId> {
  return arbitraryId();
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
  return (id ?? fc.constantFrom('yes', 'no')).chain((yesNoId) =>
    fc.record({
      id: fc.constant(yesNoId),
      label:
        yesNoId === 'yes'
          ? fc.constantFrom('Yes', 'Yep', 'Uh-huh')
          : yesNoId === 'no'
          ? fc.constantFrom('No', 'Nope', 'Nuh-uh')
          : fc.string({ minLength: 1 }),
    })
  );
}

/**
 * Builds values for yes/no contests.
 */
export function arbitraryYesNoContest({
  id = arbitraryContestId(),
  districtId = arbitraryDistrictId(),
  partyId = arbitraryOptional(arbitraryPartyId()),
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
  id = arbitraryCandidateId(),
  partyIds = fc.constant(undefined),
}: {
  id?: fc.Arbitrary<Candidate['id']>;
  partyIds?: fc.Arbitrary<Array<Party['id']> | undefined>;
} = {}): fc.Arbitrary<Candidate> {
  return fc.record({
    id,
    name: fc.string({ minLength: 1 }),
    partyIds,
  });
}

/**
 * Builds values for candidate contest.
 */
export function arbitraryCandidateContest({
  id = arbitraryContestId(),
  districtId = arbitraryDistrictId(),
  partyIds = fc.array(arbitraryPartyId(), { minLength: 1 }),
  allowWriteIns = fc.boolean(),
}: {
  id?: fc.Arbitrary<CandidateContest['id']>;
  districtId?: fc.Arbitrary<District['id']>;
  partyIds?: fc.Arbitrary<Array<Party['id']>>;
  allowWriteIns?: fc.Arbitrary<boolean>;
} = {}): fc.Arbitrary<CandidateContest> {
  return fc.record({
    type: fc.constant('candidate'),
    id,
    title: fc.string({ minLength: 1 }),
    section: fc.string({ minLength: 1 }),
    districtId,
    allowWriteIns,
    seats: fc.integer({ min: 1, max: 5 }),
    candidates: fc
      .array(
        partyIds
          .chain((ids) =>
            ids.length ? fc.subarray(ids) : fc.constant(undefined)
          )
          .chain((ids) => arbitraryCandidate({ partyIds: fc.constant(ids) }))
      )
      .filter(hasUniqueIds),
  });
}

export function arbitraryMsEitherNeitherContest({
  districtId = arbitraryDistrictId(),
}: {
  districtId?: fc.Arbitrary<District['id']>;
} = {}): fc.Arbitrary<MsEitherNeitherContest> {
  return fc.record({
    type: fc.constant('ms-either-neither'),
    id: arbitraryContestId(),
    title: fc.string({ minLength: 1 }),
    section: fc.string({ minLength: 1 }),
    description: fc.string({ minLength: 1 }),
    districtId,
    eitherNeitherContestId: arbitraryContestId(),
    eitherNeitherLabel: fc.string({ minLength: 1 }),
    eitherOption: arbitraryYesNoOption(),
    neitherOption: arbitraryYesNoOption(),
    pickOneContestId: arbitraryContestId(),
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
  id = arbitraryDistrictId(),
}: { id?: fc.Arbitrary<District['id']> } = {}): fc.Arbitrary<District> {
  return fc.record({
    id,
    name: fc.string({ minLength: 1 }),
  });
}

export function arbitraryPrecinct({
  id = arbitraryPrecinctId(),
}: { id?: fc.Arbitrary<Precinct['id']> } = {}): fc.Arbitrary<Precinct> {
  return fc.record({
    id,
    name: fc.string({ minLength: 1 }),
  });
}

export function arbitraryBallotStyle({
  id = arbitraryBallotStyleId(),
  districtIds = fc.array(arbitraryDistrictId()),
  precinctIds = fc.array(arbitraryPrecinctId()),
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
  id = arbitraryCountyId(),
}: { id?: fc.Arbitrary<County['id']> } = {}): fc.Arbitrary<County> {
  return fc.record({ id, name: fc.string({ minLength: 1 }) });
}

export function arbitraryParty({
  id = arbitraryPartyId(),
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
 * Builds a ballot locale for an election.
 */
export function arbitraryBallotLocale(): fc.Arbitrary<BallotLocale> {
  return fc
    .record({
      primary: fc.constantFrom('en-US', 'es-US', 'fr-US'),
    })
    .chain(({ primary }) => {
      const secondary = primary === 'en-US' ? 'es-US' : 'en-US';
      return fc.record({
        primary: fc.constant(primary),
        secondary: arbitraryOptional(fc.constant(secondary)),
      });
    });
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
      electionHash: sha256(electionData),
    }));
}

/**
 * Builds valid cast-vote records. To build multiple for a single election,
 * you may find it easier to use {@link arbitraryCastVoteRecords}.
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
      _ballotId: arbitraryOptional(arbitraryBallotId()),
      _ballotStyleId: fc.constantFrom(...e.ballotStyles.map(({ id }) => id)),
      _ballotType: fc.constantFrom('absentee', 'provisional', 'standard'),
      _batchId: arbitraryId(),
      _batchLabel: fc.string({ minLength: 1 }),
      _testBallot: testBallot,
      _scannerId: arbitraryId(),
      _pageNumbers: fc
        .integer({ min: 0, max: 3 })
        .map((index) => [index * 2 + 1, index * 2 + 2]),
      _locales: arbitraryBallotLocale(),
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
