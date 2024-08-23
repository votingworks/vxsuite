import {
  BallotStyleId,
  ContestId,
  ContestIdSchema,
  DistrictId,
  DistrictIdSchema,
  Id,
  PartyId,
  PartyIdSchema,
  PrecinctId,
  unsafeParse,
} from '@votingworks/types';
import { sha256 } from 'js-sha256';
import { CandidateName, Candidates, YesNoQuestion } from './accuvote';

/**
 * Maps AccuVote data to IDs.
 */
export interface AccuVoteDataToIdMap {
  partyId(name: string): PartyId;
  precinctId(townId: string, rawPrecinctId?: string): PrecinctId;
  districtId(precinctIds: Iterable<PrecinctId>): DistrictId;

  ballotStyleId(
    precinctIds: Iterable<PrecinctId>,
    districtIds: Iterable<DistrictId>,
    partyName?: string
  ): BallotStyleId;

  candidateContestId(
    { officeName, candidateNames }: Candidates,
    electionPartyName?: string
  ): ContestId;
  candidateId(candidateName: CandidateName): Id;

  yesNoContestId(yesNoQuestion: YesNoQuestion): ContestId;
  yesOptionId(yesNoQuestion: YesNoQuestion): Id;
  noOptionId(yesNoQuestion: YesNoQuestion): Id;
}

/**
 * Generates an ID from the given text.
 */
export function makeId(printable: string, extra = ''): string {
  const hash = sha256(printable + extra);
  return `${printable.replace(/[^-_a-z\d+]+/gi, '-').slice(0, 64)}-${hash.slice(
    0,
    8
  )}`;
}

/**
 * Implementation of AccuVoteDataToIdMap that uses the AccuVote data to generate
 * IDs.
 */
export class AccuVoteDataToIdMapImpl implements AccuVoteDataToIdMap {
  partyId(name: string): PartyId {
    return unsafeParse(PartyIdSchema, makeId(name));
  }

  precinctId(townId: string, rawPrecinctId?: string): PrecinctId {
    const cleanedPrecinctId = rawPrecinctId?.replace(/[^-_\w]/g, '');
    return cleanedPrecinctId
      ? `town-id-${townId}-precinct-id-${cleanedPrecinctId}`
      : `town-id-${townId}-precinct`;
  }

  districtId(precinctIds: Iterable<PrecinctId>): DistrictId {
    return unsafeParse(
      DistrictIdSchema,
      makeId('district', [...precinctIds].sort().join(';'))
    );
  }

  ballotStyleId(
    precinctIds: Iterable<PrecinctId>,
    districtIds: Iterable<DistrictId>,
    partyName?: string
  ): BallotStyleId {
    return makeId(
      `ballot-style${partyName ? `-${partyName}` : ''}`,
      [...precinctIds, ...districtIds].sort().join(';')
    );
  }

  candidateContestId(
    { officeName, candidateNames }: Candidates,
    electionPartyName?: string
  ): ContestId {
    return unsafeParse(
      ContestIdSchema,
      makeId(
        `${officeName.name}${electionPartyName ? `-${electionPartyName}` : ''}`,
        candidateNames
          .map((candidate) => candidate.name)
          .sort()
          .join(';')
      )
    );
  }

  yesNoContestId(yesNoQuestion: YesNoQuestion): ContestId {
    return unsafeParse(ContestIdSchema, makeId(yesNoQuestion.title));
  }

  yesOptionId(yesNoQuestion: YesNoQuestion): Id {
    return `${this.yesNoContestId(yesNoQuestion)}-option-yes`;
  }

  noOptionId(yesNoQuestion: YesNoQuestion): Id {
    return `${this.yesNoContestId(yesNoQuestion)}-option-no`;
  }

  candidateId(candidateName: CandidateName): Id {
    return makeId(candidateName.name);
  }
}
