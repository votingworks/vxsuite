import { assertDefined, throwIllegalValue } from '@votingworks/basics';
import {
  AnyContest,
  BallotMode,
  BallotStyleId,
  BallotType,
  Candidate,
  District,
  Election,
  hasSplits,
  Party,
  Precinct,
} from '@votingworks/types';
import { customAlphabet } from 'nanoid';
import { Buffer } from 'node:buffer';
import { MAX_POSTGRES_INDEX_KEY_BYTES } from './globals';
import { User } from './types';

export function getBallotPdfFileName(
  precinctName: string,
  ballotStyleId: BallotStyleId,
  ballotType: BallotType,
  ballotMode: BallotMode,
  ballotAuditId?: string
): string {
  const baseName = [
    ballotMode,
    ballotType,
    'ballot',
    precinctName.replaceAll(' ', '_'),
    ballotStyleId,
    ballotAuditId,
  ]
    .filter(Boolean)
    .join('-');
  return `${baseName}.pdf`;
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
export function regenerateElectionIds(election: Election): {
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
  const precincts = election.precincts.map((precinct) => {
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
    precincts,
    parties,
    contests,
  };
}

/**
 * Our translation caches use the text as part of the primary key.
 * Ensure that the text fits within the byte limit for a Postgres primary key.
 */
export function isValidPrimaryKey(text: string): boolean {
  const textSizeInBytes = Buffer.byteLength(text, 'utf8');
  return textSizeInBytes < MAX_POSTGRES_INDEX_KEY_BYTES;
}

export function splitCandidateName(
  name: string
): Pick<Candidate, 'firstName' | 'middleName' | 'lastName'> {
  const [firstPart, ...middleParts] = name.split(' ');
  return {
    firstName: firstPart ?? '',
    lastName: middleParts.pop() ?? '',
    middleName: middleParts.join(' '),
  };
}

export function userBelongsToOrg(user: User, orgId: string): boolean {
  return user.jurisdictions.some((org) => org.id === orgId);
}
