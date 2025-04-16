import { assertDefined, throwIllegalValue } from '@votingworks/basics';
import { BallotMode } from '@votingworks/hmpb';
import {
  AnyContest,
  BallotStyleId,
  BallotType,
  District,
  Election,
  hasSplits,
  Party,
  Precinct,
} from '@votingworks/types';
import { customAlphabet } from 'nanoid';

export function getPdfFileName(
  precinctName: string,
  ballotStyleId: BallotStyleId,
  ballotType: BallotType,
  ballotMode: BallotMode
): string {
  return `${ballotMode}-${ballotType}-ballot-${precinctName.replaceAll(
    ' ',
    '_'
  )}-${ballotStyleId}.pdf`;
}

const idGenerator = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 12);

/**
 * Generates a URL-friendly and double-click-copy-friendly unique ID using a
 * cryptographically secure RNG.
 */
export function generateId(): string {
  return idGenerator();
}

/**
 * Regenerate the IDs of all entities in an election, ensuring that all
 * references are updated.
 */
export function regenerateElectionIds(
  election: Election,
  precincts: Precinct[]
): {
  districts: District[];
  precincts: Precinct[];
  parties: Party[];
  contests: AnyContest[];
} {
  const idMap = new Map<string, string>();
  function replaceId<T extends string>(id: T): T {
    if (!idMap.has(id)) {
      idMap.set(id, generateId());
    }
    return assertDefined(idMap.get(id)) as T;
  }

  const districts = election.districts.map((district) => ({
    ...district,
    id: replaceId(district.id),
  }));
  const updatedPrecincts = precincts.map((precinct) => {
    if (hasSplits(precinct)) {
      return {
        ...precinct,
        id: replaceId(precinct.id),
        splits: precinct.splits.map((split) => ({
          ...split,
          id: replaceId(split.id),
          districtIds: split.districtIds.map(replaceId),
        })),
      };
    }
    return {
      ...precinct,
      id: replaceId(precinct.id),
      districtIds: precinct.districtIds.map(replaceId),
    };
  });
  const parties = election.parties.map((party) => ({
    ...party,
    id: replaceId(party.id),
  }));
  const contests = election.contests.map((contest) => ({
    ...contest,
    id: replaceId(contest.id),
    districtId: replaceId(contest.districtId),
    ...(() => {
      switch (contest.type) {
        case 'candidate':
          return {
            partyId: contest.partyId ? replaceId(contest.partyId) : undefined,
            candidates: contest.candidates.map((candidate) => ({
              ...candidate,
              id: replaceId(candidate.id),
              partyIds: candidate.partyIds?.map(replaceId),
            })),
          };
        case 'yesno':
          return {
            yesOption: {
              ...contest.yesOption,
              id: replaceId(contest.yesOption.id),
            },
            noOption: {
              ...contest.noOption,
              id: replaceId(contest.noOption.id),
            },
          };
        default: {
          /* istanbul ignore next - @preserve */
          throwIllegalValue(contest);
        }
      }
    })(),
  }));
  return {
    districts,
    precincts: updatedPrecincts,
    parties,
    contests,
  };
}
