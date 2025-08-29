import { assertDefined, throwIllegalValue } from '@votingworks/basics';
import { BallotMode } from '@votingworks/hmpb';
import {
  AnyContest,
  BallotStyleId,
  BallotType,
  District,
  Election,
  ExternalToVxIdMapping,
  hasSplits,
  Party,
  Precinct,
} from '@votingworks/types';
import { customAlphabet } from 'nanoid';

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
  customBallotContent: Election['customBallotContent'];
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

  let externalToVxIdMapping: ExternalToVxIdMapping | undefined;
  if (election.customBallotContent?.externalToVxIdMapping) {
    const original = election.customBallotContent.externalToVxIdMapping;

    externalToVxIdMapping = {
      candidates: Object.fromEntries(
        Object.entries(original.candidates).map(([idExternal, idVx]) => [
          idExternal,
          replaceId(idVx),
        ])
      ),
      contests: Object.fromEntries(
        Object.entries(original.contests).map(([idExternal, idVx]) => [
          idExternal,
          replaceId(idVx),
        ])
      ),
    };
  }

  const customBallotContent = election.customBallotContent && {
    candidateAddresses:
      election.customBallotContent.candidateAddresses &&
      Object.fromEntries(
        Object.entries(election.customBallotContent.candidateAddresses).map(
          ([candidateId, value]) => [replaceId(candidateId), value]
        )
      ),
    externalToVxIdMapping,
    presidentialCandidateBallotStrings:
      election.customBallotContent.presidentialCandidateBallotStrings &&
      Object.fromEntries(
        Object.entries(
          election.customBallotContent.presidentialCandidateBallotStrings
        ).map(([candidateId, value]) => [replaceId(candidateId), value])
      ),
  };

  return {
    districts,
    precincts,
    parties,
    contests,
    customBallotContent,
  };
}
