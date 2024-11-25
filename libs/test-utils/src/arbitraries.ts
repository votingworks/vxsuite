/**
 * Defines election arbitraries for `fast-check` property tests.
 */

import fc from 'fast-check';
import { DateTime } from 'luxon';
import {
  BallotId,
  BallotLayout,
  HmpbBallotPaperSize,
  BallotStyle,
  BallotStyleId,
  Candidate,
  CandidateContest,
  CandidateId,
  ContestId,
  Contests,
  County,
  CountyId,
  District,
  DistrictId,
  Election,
  ElectionDefinition,
  ELECTION_TYPES,
  Id,
  Party,
  PartyId,
  Precinct,
  PrecinctId,
  YesNoContest,
  YesNoOption,
  UiStringsPackage,
  ElectionId,
  BallotStyleGroupId,
} from '@votingworks/types';
import { sha256 } from 'js-sha256';
import { DateWithoutTime, assertDefined } from '@votingworks/basics';
import { TestLanguageCode } from './test_language_code';

/**
 * Builds arbitrary uint2 values.
 */
export function arbitraryUint2(): fc.Arbitrary<number> {
  return fc.integer(0, 0b11);
}

/**
 * Builds arbitrary uint4 values.
 */
export function arbitraryUint4(): fc.Arbitrary<number> {
  return fc.integer(0, 0b1111);
}

/**
 * Builds arbitrary uint8 values.
 */
export function arbitraryUint8(): fc.Arbitrary<number> {
  return fc.integer(0, 0xff);
}

/**
 * Builds arbitrary uint16 values.
 */
export function arbitraryUint16(): fc.Arbitrary<number> {
  return fc.integer(0, 0xffff);
}

/**
 * Builds arbitrary uint24 values.
 */
export function arbitraryUint24(): fc.Arbitrary<number> {
  return fc.integer(0, 0xffffff);
}

/**
 * Builds arbitrary uint32 values.
 */
export function arbitraryUint32(): fc.Arbitrary<number> {
  return fc.integer(0, 0xffffffff);
}

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
  return arbitraryId() as fc.Arbitrary<BallotStyleId>;
}

/**
 * Builds values suitable for ballot style IDs.
 */
export function arbitraryBallotStyleGroupId(): fc.Arbitrary<BallotStyleGroupId> {
  return arbitraryId() as fc.Arbitrary<BallotStyleGroupId>;
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
 * Builds values suitable for election IDs.
 */
export function arbitraryElectionId(): fc.Arbitrary<ElectionId> {
  return arbitraryId() as fc.Arbitrary<ElectionId>;
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
        const result = DateTime.fromObject(parts, { zone: zoneName });
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
}: {
  id: fc.Arbitrary<YesNoOption['id']>;
}): fc.Arbitrary<YesNoOption> {
  return fc.record({
    id,
    label: fc.string({ minLength: 1 }),
  });
}

/**
 * Builds values for yes/no contests.
 */
export function arbitraryYesNoContest({
  id = arbitraryContestId(),
  districtId = arbitraryDistrictId(),
}: {
  id?: fc.Arbitrary<YesNoContest['id']>;
  districtId?: fc.Arbitrary<District['id']>;
} = {}): fc.Arbitrary<YesNoContest> {
  return fc.record({
    type: fc.constant('yesno'),
    title: fc.string({ minLength: 1 }),
    description: fc.string({ minLength: 1 }),
    id,
    districtId,
    yesOption: arbitraryYesNoOption({ id: arbitraryId() }),
    noOption: arbitraryYesNoOption({ id: arbitraryId() }),
  });
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

export function arbitraryContests({
  partyIds,
}: {
  partyIds?: fc.Arbitrary<Array<Party['id']>>;
} = {}): fc.Arbitrary<Contests> {
  return fc
    .tuple(
      fc.array(arbitraryCandidateContest({ partyIds })),
      fc.array(arbitraryYesNoContest())
    )
    .map(([candidateContests, otherContests]) => [
      ...candidateContests,
      ...otherContests,
    ])
    .filter((contests) => contests.length > 0)
    .filter(hasUniqueIds)
    .filter((contests) =>
      hasUniqueIds(
        contests.flatMap((contest) =>
          contest.type === 'yesno' ? [contest.yesOption, contest.noOption] : []
        )
      )
    );
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
  groupId = arbitraryBallotStyleGroupId(),
  districtIds = fc.array(arbitraryDistrictId()),
  precinctIds = fc.array(arbitraryPrecinctId()),
}: {
  id?: fc.Arbitrary<BallotStyle['id']>;
  groupId?: fc.Arbitrary<BallotStyle['groupId']>;
  districtIds?: fc.Arbitrary<Array<District['id']>>;
  precinctIds?: fc.Arbitrary<Array<Precinct['id']>>;
} = {}): fc.Arbitrary<BallotStyle> {
  return fc.record({
    id,
    groupId,
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
    paperSize: fc.constantFrom(...Object.values(HmpbBallotPaperSize)),
    metadataEncoding: fc.constantFrom('qr-code', 'timing-marks'),
  });
}

export function arbitraryUiStrings(): fc.Arbitrary<UiStringsPackage> {
  return fc.record(
    Object.fromEntries(
      Object.values(TestLanguageCode).map((languageCode) => [
        languageCode,
        fc.dictionary(fc.string(), fc.string()),
      ])
    )
  );
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
          id: arbitraryElectionId(),
          type: fc.constantFrom(...ELECTION_TYPES),
          title: fc.string({ minLength: 1 }),
          county: arbitraryCounty(),
          state: fc.string({ minLength: 2, maxLength: 2 }),
          date: fc
            .date({
              min: new Date('0001-01-01'),
              max: new Date('9999-12-31'),
            })
            .map(
              (date) =>
                new DateWithoutTime(
                  assertDefined(date.toISOString().split('T')[0])
                )
            ),
          seal: fc.string({ minLength: 1, maxLength: 200 }),
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
          ballotStrings: arbitraryUiStrings(),
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
      ballotHash: sha256(electionData),
    }));
}
