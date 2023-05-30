import { assertDefined } from '@votingworks/basics';
import {
  BallotStyleId,
  CandidateContest,
  CandidateId,
  ContestId,
  Election,
  PartyId,
  Tabulation,
  YesNoContest,
  writeInCandidate,
} from '@votingworks/types';
import { GroupKey } from '@votingworks/types/src/tabulation';

export function getEmptyYesNoContestResults(
  contest: YesNoContest
): Tabulation.YesNoContestResults {
  return {
    contestId: contest.id,
    contestType: 'yesno',
    overvotes: 0,
    undervotes: 0,
    ballots: 0,
    yesTally: 0,
    noTally: 0,
  };
}

/**
 * Generate an empty {@link Tabulation.CandidateContestResult} with zero
 * tallies for all official candidate and a zero tally for a generic write-in
 * by default if the contest allows.
 */
export function getEmptyCandidateContestResults(
  contest: CandidateContest,
  includeGenericWriteInIfAllowed: boolean
): Tabulation.CandidateContestResults {
  const tallies: Tabulation.CandidateContestResults['tallies'] = {};

  for (const candidate of contest.candidates) {
    tallies[candidate.id] = {
      id: candidate.id,
      name: candidate.name,
      tally: 0,
    };
  }

  if (contest.allowWriteIns && includeGenericWriteInIfAllowed) {
    tallies[writeInCandidate.id] = {
      ...writeInCandidate,
      tally: 0,
    };
  }

  return {
    contestId: contest.id,
    contestType: 'candidate',
    votesAllowed: contest.seats,
    overvotes: 0,
    undervotes: 0,
    ballots: 0,
    tallies,
  };
}

/**
 * Generate an empty {@link Tabulation.ElectionResult} with empty tallies for
 * all contests in the election.
 */
export function getEmptyElectionResults(
  election: Election,
  includeGenericWriteInIfAllowed = true
): Tabulation.ElectionResults {
  const contestResults: Tabulation.ElectionResults['contestResults'] = {};
  for (const contest of election.contests) {
    contestResults[contest.id] =
      contest.type === 'yesno'
        ? getEmptyYesNoContestResults(contest)
        : getEmptyCandidateContestResults(
            contest,
            includeGenericWriteInIfAllowed
          );
  }

  return {
    contestResults,
    cardCounts: {
      bmd: 0,
    },
  };
}

/**
 * Adds a cast vote record to an election result and returns the election
 * result. Mutates the election result in place!
 */
function addCastVoteRecordToElectionResult(
  electionResult: Tabulation.ElectionResults,
  cvr: Tabulation.CastVoteRecord
): Tabulation.ElectionResults {
  // eslint-disable-next-line no-param-reassign
  electionResult.cardCounts[cvr.cardType] =
    (electionResult.cardCounts[cvr.cardType] ?? 0) + 1;

  for (const [contestId, optionIds] of Object.entries(cvr.votes)) {
    const contestResult = assertDefined(
      electionResult.contestResults[contestId]
    );

    contestResult.ballots += 1;

    if (contestResult.contestType === 'yesno') {
      if (optionIds.length === 2) {
        contestResult.overvotes += 1;
      } else if (optionIds.length === 0) {
        contestResult.undervotes += 1;
      } else if (optionIds[0] === 'yes') {
        contestResult.yesTally += 1;
      } else {
        contestResult.noTally += 1;
      }
    } else if (optionIds.length > contestResult.votesAllowed) {
      contestResult.overvotes += contestResult.votesAllowed;
    } else {
      if (optionIds.length < contestResult.votesAllowed) {
        contestResult.undervotes +=
          contestResult.votesAllowed - optionIds.length;
      }

      for (const optionId of optionIds) {
        if (optionId.startsWith('write-in-')) {
          const genericWriteInTally = assertDefined(
            contestResult.tallies[writeInCandidate.id]
          );
          genericWriteInTally.tally += 1;
        } else {
          const candidateTally = assertDefined(contestResult.tallies[optionId]);
          candidateTally.tally += 1;
        }
      }
    }
  }

  return electionResult;
}

/**
 * Applies our current, simple method of determining and overall ballot count,
 * which is taking the count of the first cards of HMPBs plus BMD count.
 */
export function getBallotCount(cardCounts: Tabulation.CardCounts): number {
  return cardCounts['bmd'] + (cardCounts[1] || 0);
}

export function isGroupByEmpty(groupBy: Tabulation.GroupBy): boolean {
  return !(
    groupBy.groupByBallotStyle ||
    groupBy.groupByBatch ||
    groupBy.groupByPrecinct ||
    groupBy.groupByParty ||
    groupBy.groupByScanner ||
    groupBy.groupByVotingMethod
  );
}

export type BallotStyleIdPartyIdLookup = Record<BallotStyleId, PartyId>;

/**
 * Creates a dictionary with keys of ballot style ids and values of their
 * corresponding party ids, if they exist.
 */
export function getBallotStyleIdPartyIdLookup(
  election: Election
): BallotStyleIdPartyIdLookup {
  const lookup: BallotStyleIdPartyIdLookup = {};
  for (const ballotStyle of election.ballotStyles) {
    if (ballotStyle.partyId) {
      lookup[ballotStyle.id] = ballotStyle.partyId;
    }
  }
  return lookup;
}

export interface OfficialCandidateNameLookup {
  get: (contestId: ContestId, candidateId: CandidateId) => string;
}

export function getOfficialCandidateNameLookup(
  election: Election
): OfficialCandidateNameLookup {
  const lookupInternal: Record<ContestId, Record<CandidateId, string>> = {};
  for (const contest of election.contests) {
    if (contest.type === 'candidate') {
      const contestCandidateLookup: Record<CandidateId, string> = {};
      for (const candidate of contest.candidates) {
        contestCandidateLookup[candidate.id] = candidate.name;
      }
      lookupInternal[contest.id] = contestCandidateLookup;
    }
  }

  function get(contestId: ContestId, candidateId: CandidateId): string {
    return assertDefined(assertDefined(lookupInternal[contestId])[candidateId]);
  }

  return {
    get,
  };
}

function getCastVoteRecordGroupSpecifier(
  cvr: Tabulation.CastVoteRecord,
  groupBy: Tabulation.GroupBy,
  partyIdLookup: BallotStyleIdPartyIdLookup
): Tabulation.GroupSpecifier {
  return {
    ballotStyleId: groupBy.groupByBallotStyle ? cvr.ballotStyleId : undefined,
    precinctId: groupBy.groupByPrecinct ? cvr.precinctId : undefined,
    batchId: groupBy.groupByBatch ? cvr.batchId : undefined,
    scannerId: groupBy.groupByScanner ? cvr.scannerId : undefined,
    votingMethod: groupBy.groupByVotingMethod ? cvr.votingMethod : undefined,
    partyId: groupBy.groupByParty
      ? partyIdLookup[cvr.ballotStyleId]
      : undefined,
  };
}

const GROUP_KEY_SEPARATOR = '&';
export const GROUP_KEY_ROOT: GroupKey = 'root';

function escapeGroupKeyPart(groupKeyPart: string): string {
  return groupKeyPart.replaceAll('\\', '\\\\').replaceAll('&', '\\&');
}

/**
 * Based on a group's attributes, defines a key which is used to
 * lookup and identify grouped election results.
 */
export function getGroupKey(
  groupSpecifier: Tabulation.GroupSpecifier,
  groupBy: Tabulation.GroupBy
): Tabulation.GroupKey {
  const keyParts: string[] = [GROUP_KEY_ROOT];
  if (groupBy.groupByBallotStyle) {
    keyParts.push(assertDefined(groupSpecifier.ballotStyleId));
  }

  if (groupBy.groupByParty) {
    keyParts.push(assertDefined(groupSpecifier.partyId));
  }

  if (groupBy.groupByBatch) {
    keyParts.push(assertDefined(groupSpecifier.batchId));
  }

  if (groupBy.groupByScanner) {
    keyParts.push(assertDefined(groupSpecifier.scannerId));
  }

  if (groupBy.groupByPrecinct) {
    keyParts.push(assertDefined(groupSpecifier.precinctId));
  }

  if (groupBy.groupByVotingMethod) {
    keyParts.push(assertDefined(groupSpecifier.votingMethod));
  }

  return keyParts.map(escapeGroupKeyPart).join(GROUP_KEY_SEPARATOR);
}

/**
 * Tabulates iterable cast vote records into election results, grouped by
 * the attributes specified {@link Tabulation.GroupBy} parameter.
 */
export function tabulateCastVoteRecords({
  election,
  cvrs,
  groupBy,
}: {
  cvrs: Iterable<Tabulation.CastVoteRecord>;
  election: Election;
  groupBy?: Tabulation.GroupBy;
}): Tabulation.GroupedElectionResults {
  const groupedElectionResults: Tabulation.GroupedElectionResults = {};

  // optimized special case, when the results do not need to be grouped
  if (!groupBy || isGroupByEmpty(groupBy)) {
    const electionResults = getEmptyElectionResults(election);
    for (const cvr of cvrs) {
      addCastVoteRecordToElectionResult(electionResults, cvr);
    }
    groupedElectionResults[GROUP_KEY_ROOT] = electionResults;
    return groupedElectionResults;
  }

  // general case, grouping results by specified group by clause
  const partyIdLookup = getBallotStyleIdPartyIdLookup(election);
  for (const cvr of cvrs) {
    const groupSpecifier = getCastVoteRecordGroupSpecifier(
      cvr,
      groupBy,
      partyIdLookup
    );
    const groupKey = getGroupKey(groupSpecifier, groupBy);
    const existingElectionResult = groupedElectionResults[groupKey];
    if (existingElectionResult) {
      addCastVoteRecordToElectionResult(existingElectionResult, cvr);
    } else {
      const electionResult: Tabulation.ElectionResults = {
        ...groupSpecifier,
        ...getEmptyElectionResults(election),
      };
      addCastVoteRecordToElectionResult(electionResult, cvr);
      groupedElectionResults[groupKey] = electionResult;
    }
  }

  return groupedElectionResults;
}

/**
 * From any object that includes a group specifier, extract only the group
 * specifier. For testing purposes.
 */
export function extractGroupSpecifier(
  entity: Tabulation.GroupSpecifier
): Tabulation.GroupSpecifier {
  return {
    ballotStyleId: entity.ballotStyleId,
    batchId: entity.batchId,
    scannerId: entity.scannerId,
    precinctId: entity.precinctId,
    partyId: entity.partyId,
    votingMethod: entity.votingMethod,
  };
}
