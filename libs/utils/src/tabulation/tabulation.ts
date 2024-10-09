import {
  assert,
  assertDefined,
  iter,
  throwIllegalValue,
} from '@votingworks/basics';
import {
  AnyContest,
  BallotStyleGroupId,
  CandidateContest,
  CandidateId,
  ContestId,
  ContestOptionId,
  Election,
  Id,
  PartyId,
  Tabulation,
  YesNoContest,
} from '@votingworks/types';
import { isGroupByEmpty } from './arguments';
import { getGroupedBallotStyles } from '../ballot_styles';

export function getEmptyYesNoContestResults(
  contest: YesNoContest
): Tabulation.YesNoContestResults {
  return {
    contestId: contest.id,
    contestType: 'yesno',
    yesOptionId: contest.yesOption.id,
    noOptionId: contest.noOption.id,
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
  includeGenericWriteInIfAllowed?: boolean
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
    tallies[Tabulation.GENERIC_WRITE_IN_ID] = {
      ...Tabulation.GENERIC_WRITE_IN_CANDIDATE,
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

export function getEmptyCardCounts(): Tabulation.CardCounts {
  return {
    bmd: 0,
    hmpb: [],
  };
}

/**
 * Generate an empty {@link Tabulation.ElectionResults} with empty tallies for
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
    cardCounts: getEmptyCardCounts(),
  };
}

/**
 * Generate an empty {@link Tabulation.ManualElectionResult} with zero tallies for
 * all contests in the election. Includes placeholder zero tallies for official
 * candidates in candidate races, but no placeholder zero tallies for any
 * specific or generic write-in candidates.
 */
export function getEmptyManualElectionResults(
  election: Election
): Tabulation.ManualElectionResults {
  const contestResults: Tabulation.ElectionResults['contestResults'] = {};
  for (const contest of election.contests) {
    contestResults[contest.id] =
      contest.type === 'yesno'
        ? getEmptyYesNoContestResults(contest)
        : getEmptyCandidateContestResults(contest, false);
  }

  return {
    contestResults,
    ballotCount: 0,
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
  const { cardCounts } = electionResult;
  if (cvr.card.type === 'bmd') {
    cardCounts.bmd += 1;
  } else {
    cardCounts.hmpb[cvr.card.sheetNumber - 1] =
      (cardCounts.hmpb[cvr.card.sheetNumber - 1] ?? 0) + 1;
  }

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
      } else if (optionIds[0] === contestResult.yesOptionId) {
        contestResult.yesTally += 1;
      } else {
        assert(
          optionIds[0] === contestResult.noOptionId,
          `Invalid option id: ${optionIds[0]}`
        );
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
            contestResult.tallies[Tabulation.GENERIC_WRITE_IN_ID]
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

export type BallotStyleIdPartyIdLookup = Record<BallotStyleGroupId, PartyId>;

/**
 * Creates a dictionary with keys of ballot style ids and values of their
 * corresponding party ids, if they exist.
 */
export function getBallotStyleIdPartyIdLookup(
  election: Election
): BallotStyleIdPartyIdLookup {
  const lookup: BallotStyleIdPartyIdLookup = {};
  for (const ballotStyle of getGroupedBallotStyles(election.ballotStyles)) {
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
  groupBy: Tabulation.GroupBy
): Tabulation.GroupSpecifier {
  return {
    ballotStyleGroupId: groupBy.groupByBallotStyle
      ? cvr.ballotStyleGroupId
      : undefined,
    precinctId: groupBy.groupByPrecinct ? cvr.precinctId : undefined,
    batchId: groupBy.groupByBatch ? cvr.batchId : undefined,
    scannerId: groupBy.groupByScanner ? cvr.scannerId : undefined,
    votingMethod: groupBy.groupByVotingMethod ? cvr.votingMethod : undefined,
    partyId: groupBy.groupByParty ? cvr.partyId : undefined,
  };
}

export const GROUP_KEY_ROOT: Tabulation.GroupKey = 'root';
type GroupKeyPartType =
  | 'ballotStyleGroupId'
  | 'batchId'
  | 'partyId'
  | 'precinctId'
  | 'scannerId'
  | 'votingMethod';

function escapeGroupKeyValue(groupKeyValue: string): string {
  return groupKeyValue
    .replaceAll('\\', '\\\\')
    .replaceAll('&', '\\&')
    .replaceAll('=', '\\=');
}

function unescapeGroupKeyValue(groupKeyValue: string): string {
  return groupKeyValue
    .replaceAll('\\=', '=')
    .replaceAll('\\&', '&')
    .replaceAll('\\\\', '\\');
}

function getGroupKeyPart(key: GroupKeyPartType, value?: string): string {
  assert(value !== undefined);
  return `${key}=${escapeGroupKeyValue(value)}`;
}

/**
 * Based on a group's attributes, defines a key which is used to
 * look up and uniquely identify tabulation objects within a grouping.
 *
 * Adds key parts in alphabetical order for consistency.
 */
export function getGroupKey(
  groupSpecifier: Tabulation.GroupSpecifier,
  groupBy: Tabulation.GroupBy
): Tabulation.GroupKey {
  const keyParts: string[] = [GROUP_KEY_ROOT];
  if (groupBy.groupByBallotStyle) {
    keyParts.push(
      getGroupKeyPart('ballotStyleGroupId', groupSpecifier.ballotStyleGroupId)
    );
  }

  if (groupBy.groupByBatch) {
    keyParts.push(getGroupKeyPart('batchId', groupSpecifier.batchId));
  }

  if (groupBy.groupByParty) {
    keyParts.push(getGroupKeyPart('partyId', groupSpecifier.partyId));
  }

  if (groupBy.groupByPrecinct) {
    keyParts.push(getGroupKeyPart('precinctId', groupSpecifier.precinctId));
  }

  if (groupBy.groupByScanner) {
    keyParts.push(getGroupKeyPart('scannerId', groupSpecifier.scannerId));
  }

  if (groupBy.groupByVotingMethod) {
    keyParts.push(getGroupKeyPart('votingMethod', groupSpecifier.votingMethod));
  }

  return keyParts.join('&');
}

export function getGroupSpecifierFromGroupKey(
  groupKey: Tabulation.GroupKey
): Tabulation.GroupSpecifier {
  const parts = groupKey.split(/(?<!\\)&/);
  const groupSpecifier: Tabulation.GroupSpecifier = {};
  for (const part of parts) {
    if (part === GROUP_KEY_ROOT) {
      continue;
    }

    const [key, escapedValue] = part.split(/(?<!\\)=/) as [
      GroupKeyPartType,
      string,
    ];
    const value = unescapeGroupKeyValue(escapedValue);
    switch (key) {
      case 'ballotStyleGroupId':
        groupSpecifier.ballotStyleGroupId = unescapeGroupKeyValue(value);
        break;
      case 'partyId':
        groupSpecifier.partyId = unescapeGroupKeyValue(value);
        break;
      case 'batchId':
        groupSpecifier.batchId = unescapeGroupKeyValue(value);
        break;
      case 'scannerId':
        groupSpecifier.scannerId = unescapeGroupKeyValue(value);
        break;
      case 'precinctId':
        groupSpecifier.precinctId = unescapeGroupKeyValue(value);
        break;
      case 'votingMethod':
        groupSpecifier.votingMethod = unescapeGroupKeyValue(
          value
        ) as Tabulation.VotingMethod;
        break;
      /* istanbul ignore next */
      default:
        throwIllegalValue(key);
    }
  }
  return groupSpecifier;
}

/**
 * From any object that includes a group specifier, extract only the group
 * specifier. For testing purposes.
 */
export function extractGroupSpecifier(
  entity: Tabulation.GroupSpecifier
): Tabulation.GroupSpecifier {
  return {
    ballotStyleGroupId: entity.ballotStyleGroupId,
    batchId: entity.batchId,
    scannerId: entity.scannerId,
    precinctId: entity.precinctId,
    partyId: entity.partyId,
    votingMethod: entity.votingMethod,
  };
}

/**
 * Yield to the event loop during long-running tabulation operations.
 */
export async function yieldToEventLoop(): Promise<void> {
  await new Promise((resolve) => {
    setImmediate(resolve);
  });
}

const YIELD_TO_EVENT_LOOP_EVERY_N_CVRS = 1000;

/**
 * Tabulates iterable cast vote records into election results, grouped by
 * the attributes specified {@link Tabulation.GroupBy} parameter.
 */
export async function tabulateCastVoteRecords({
  election,
  cvrs,
  groupBy,
  expectedGroups,
}: {
  cvrs: Iterable<Tabulation.CastVoteRecord>;
  election: Election;
  groupBy?: Tabulation.GroupBy;
  expectedGroups?: Tabulation.GroupSpecifier[];
}): Promise<Tabulation.ElectionResultsGroupMap> {
  const groupedElectionResults: Tabulation.ElectionResultsGroupMap = {};

  // Optimized special case, when the results do not need to be grouped.
  if (!groupBy || isGroupByEmpty(groupBy)) {
    const electionResults = getEmptyElectionResults(election);

    let i = 0;
    for (const cvr of cvrs) {
      addCastVoteRecordToElectionResult(electionResults, cvr);

      i += 1;
      if (i % YIELD_TO_EVENT_LOOP_EVERY_N_CVRS === 0) {
        await yieldToEventLoop();
      }
    }
    groupedElectionResults[GROUP_KEY_ROOT] = electionResults;
    return groupedElectionResults;
  }

  // If a list of group specifiers is passed, it means we know all the groups we
  // could possibly see and can initialize the groups with empty election results.
  // Doing so before tabulation allows us to control insertion order.
  for (const groupSpecifier of expectedGroups ?? []) {
    const groupKey = getGroupKey(groupSpecifier, groupBy);
    groupedElectionResults[groupKey] = getEmptyElectionResults(election);
  }

  // general case, grouping results by specified group by clause
  let i = 0;
  for (const cvr of cvrs) {
    const groupSpecifier = getCastVoteRecordGroupSpecifier(cvr, groupBy);
    const groupKey = getGroupKey(groupSpecifier, groupBy);
    const existingElectionResult = groupedElectionResults[groupKey];
    if (expectedGroups) {
      assert(existingElectionResult);
      addCastVoteRecordToElectionResult(existingElectionResult, cvr);
    } else if (existingElectionResult) {
      addCastVoteRecordToElectionResult(existingElectionResult, cvr);
    } else {
      const electionResult: Tabulation.ElectionResults =
        getEmptyElectionResults(election);
      addCastVoteRecordToElectionResult(electionResult, cvr);
      groupedElectionResults[groupKey] = electionResult;
    }

    i += 1;
    if (i % YIELD_TO_EVENT_LOOP_EVERY_N_CVRS === 0) {
      await yieldToEventLoop();
    }
  }

  return groupedElectionResults;
}

/**
 * Applies our current, simple method of determining the hand-marked paper ballot
 * count, which is taking the count of the first ballot cards.
 */
export function getHmpbBallotCount(cardCounts: Tabulation.CardCounts): number {
  return cardCounts.hmpb[0] ?? 0;
}

/**
 * Gets total ballot count including HMPB, BMD, and manually entered ballots.
 */
export function getBallotCount(cardCounts: Tabulation.CardCounts): number {
  return (
    cardCounts.bmd + getHmpbBallotCount(cardCounts) + (cardCounts.manual ?? 0)
  );
}

/**
 * Gets scanned ballot count including HMPB and BMD ballots. Does not include
 * manually entered ballots.
 */
export function getScannedBallotCount(
  cardCounts: Tabulation.CardCounts
): number {
  return cardCounts.bmd + getHmpbBallotCount(cardCounts);
}

/**
 * Counts the number of sheets that have been scanned based on the card counts.
 * Simply ignores the manual count.
 */
export function getSheetCount(cardCounts: Tabulation.CardCounts): number {
  return (
    cardCounts.bmd +
    iter(cardCounts.hmpb)
      .map((c) => c ?? 0)
      .sum()
  );
}

/**
 * Combines contest results for yes/no contests. If an empty list is passed,
 * returns empty (all zero) contest results.
 */
export function combineYesNoContestResults({
  contest,
  allContestResults,
}: {
  contest: YesNoContest;
  allContestResults: Tabulation.YesNoContestResults[];
}): Tabulation.YesNoContestResults {
  const combinedContestResults = getEmptyYesNoContestResults(contest);
  for (const contestResults of allContestResults) {
    combinedContestResults.overvotes += contestResults.overvotes;
    combinedContestResults.undervotes += contestResults.undervotes;
    combinedContestResults.ballots += contestResults.ballots;
    combinedContestResults.yesTally += contestResults.yesTally;
    combinedContestResults.noTally += contestResults.noTally;
  }
  return combinedContestResults;
}

/**
 * Combines contest results for candidate contests. If an empty list is passed,
 * returns empty (all zero) contest results that include placeholder zero
 * tallies for all official candidates but none for any write-in candidates.
 */
export function combineCandidateContestResults({
  contest,
  allContestResults,
}: {
  contest: CandidateContest;
  allContestResults: Tabulation.CandidateContestResults[];
}): Tabulation.CandidateContestResults {
  const combinedContestResults = getEmptyCandidateContestResults(
    contest,
    false
  );
  for (const contestResults of allContestResults) {
    combinedContestResults.overvotes += contestResults.overvotes;
    combinedContestResults.undervotes += contestResults.undervotes;
    combinedContestResults.ballots += contestResults.ballots;

    for (const candidateTally of Object.values(contestResults.tallies)) {
      const combinedCandidateTally =
        combinedContestResults.tallies[candidateTally.id];

      if (!combinedCandidateTally) {
        combinedContestResults.tallies[candidateTally.id] = {
          ...candidateTally,
        };
      } else {
        combinedCandidateTally.tally += candidateTally.tally;
      }
    }
  }

  return combinedContestResults;
}

export function combineContestResults({
  contest,
  allContestResults,
}: {
  contest: AnyContest;
  allContestResults: Tabulation.ContestResults[];
}): Tabulation.ContestResults {
  if (contest.type === 'yesno') {
    return combineYesNoContestResults({
      contest,
      allContestResults: allContestResults as Tabulation.YesNoContestResults[],
    });
  }

  return combineCandidateContestResults({
    contest,
    allContestResults:
      allContestResults as Tabulation.CandidateContestResults[],
  });
}

/**
 * Internal helper that combines dictionaries of {@link Tabulation.ContestResults}
 * into a single dictionary of {@link Tabulation.ContestResults}. Relevant to
 * {@link Tabulation.ElectionResults} and
 * {@link Tabulation.ManualElectionResults}. Assumes that each dictionary has
 * a key and value for each contest in the election.
 */
function combineElectionContestResults({
  election,
  allElectionContestResults,
}: {
  election: Election;
  allElectionContestResults: Array<
    Tabulation.ElectionResults['contestResults']
  >;
}): Tabulation.ElectionResults['contestResults'] {
  const combinedElectionContestResults: Tabulation.ElectionResults['contestResults'] =
    {};

  for (const contest of election.contests) {
    combinedElectionContestResults[contest.id] = combineContestResults({
      contest,
      allContestResults: allElectionContestResults
        .map((electionContestResults) => electionContestResults[contest.id])
        .filter(
          (contestResults): contestResults is Tabulation.ContestResults =>
            contestResults !== undefined
        ),
    });
  }

  return combinedElectionContestResults;
}

/**
 * Combines a list of {@link Tabulation.ManualElectionResults} into a single
 * {@link Tabulation.ManualElectionResults}.
 */
export function combineManualElectionResults({
  election,
  allManualResults,
}: {
  election: Election;
  allManualResults: Tabulation.ManualElectionResults[];
}): Tabulation.ManualElectionResults {
  const ballotCount = iter(allManualResults)
    .map((results) => results.ballotCount)
    .sum();

  const electionContestResults = combineElectionContestResults({
    election,
    allElectionContestResults: allManualResults.map(
      (results) => results.contestResults
    ),
  });

  return {
    ballotCount,
    contestResults: electionContestResults,
  };
}

/**
 * Combines a list of {@link Tabulation.CardCounts} into a single
 * {@link Tabulation.CardCounts}.
 */
export function combineCardCounts(
  allCardCounts: Tabulation.CardCounts[]
): Tabulation.CardCounts {
  const combinedCardCounts: Tabulation.CardCounts = {
    bmd: 0,
    hmpb: [],
  };

  for (const cardCounts of allCardCounts) {
    combinedCardCounts.bmd += cardCounts.bmd;
    combinedCardCounts.manual =
      (combinedCardCounts.manual ?? 0) + (cardCounts.manual ?? 0);
    for (let i = 0; i < cardCounts.hmpb.length; i += 1) {
      const cardCount = cardCounts.hmpb[i];
      combinedCardCounts.hmpb[i] =
        (combinedCardCounts.hmpb[i] ?? 0) + (cardCount ?? 0);
    }
  }

  return combinedCardCounts;
}

/**
 * Combines a list of {@link Tabulation.ElectionResults} into a single
 * {@link Tabulation.ElectionResults}.
 */
export function combineElectionResults({
  election,
  allElectionResults,
}: {
  election: Election;
  allElectionResults: Tabulation.ElectionResults[];
}): Tabulation.ElectionResults {
  const combinedCardCounts = combineCardCounts(
    allElectionResults.map(({ cardCounts }) => cardCounts)
  );

  const electionContestResults = combineElectionContestResults({
    election,
    allElectionContestResults: allElectionResults.map(
      (results) => results.contestResults
    ),
  });

  return {
    cardCounts: combinedCardCounts,
    contestResults: electionContestResults,
  };
}

/**
 * Converts a {@link Tabulation.ManualElectionResults} into
 * {@link Tabulation.ElectionResults}, simply changing the ballot
 * count format.
 */
export function convertManualElectionResults(
  manualResults: Tabulation.ManualElectionResults
): Tabulation.ElectionResults {
  return {
    cardCounts: {
      bmd: 0,
      hmpb: [],
      manual: manualResults.ballotCount,
    },
    contestResults: manualResults.contestResults,
  };
}

/**
 * Shorthand type for describing contest results for fixtures.
 */
export type ContestResultsSummary = {
  ballots: number;
  overvotes?: number;
  undervotes?: number;
} & (
  | {
      type: 'candidate';
      officialOptionTallies?: Record<ContestOptionId, number>;
      writeInOptionTallies?: Record<Id, { name: string; tally: number }>;
    }
  | {
      type: 'yesno';
      yesTally?: number;
      noTally?: number;
    }
);

export function buildContestResultsFixture({
  contest,
  contestResultsSummary,
  includeGenericWriteIn,
}: {
  contest: AnyContest;
  contestResultsSummary: ContestResultsSummary;
  includeGenericWriteIn?: boolean;
}): Tabulation.ContestResults {
  const contestResults =
    contest.type === 'yesno'
      ? getEmptyYesNoContestResults(contest)
      : getEmptyCandidateContestResults(contest, includeGenericWriteIn);

  contestResults.overvotes = contestResultsSummary.overvotes ?? 0;
  contestResults.undervotes = contestResultsSummary.undervotes ?? 0;
  contestResults.ballots = contestResultsSummary.ballots;

  if (contest.type === 'yesno') {
    assert(contestResultsSummary.type === 'yesno');
    assert(contestResults.contestType === 'yesno');
    contestResults.yesTally = contestResultsSummary.yesTally ?? 0;
    contestResults.noTally = contestResultsSummary.noTally ?? 0;
  } else {
    assert(contestResultsSummary.type === 'candidate');
    assert(contestResults.contestType === 'candidate');
    // add official candidate vote counts to existing option tallies
    for (const [candidateId, candidateTally] of Object.entries(
      contestResults.tallies
    )) {
      candidateTally.tally =
        contestResultsSummary.officialOptionTallies?.[candidateId] ?? 0;
    }

    // add write-in candidate option tallies if specified
    if (contestResultsSummary.writeInOptionTallies) {
      for (const [candidateId, candidateTally] of Object.entries(
        contestResultsSummary.writeInOptionTallies
      )) {
        contestResults.tallies[candidateId] = {
          id: candidateId,
          ...candidateTally,
          isWriteIn: true,
        };
      }
    }
  }

  return contestResults;
}

export type ContestResultsSummaries = Record<ContestId, ContestResultsSummary>;

function buildElectionContestResultsFixture({
  election,
  contestResultsSummaries,
  includeGenericWriteIn,
}: {
  election: Election;
  contestResultsSummaries: ContestResultsSummaries;
  includeGenericWriteIn: boolean;
}): Tabulation.ElectionResults['contestResults'] {
  const electionContestResults: Tabulation.ElectionResults['contestResults'] =
    {};
  for (const contest of election.contests) {
    const contestResultsSummary = contestResultsSummaries[contest.id];
    electionContestResults[contest.id] = contestResultsSummary
      ? buildContestResultsFixture({
          contest,
          contestResultsSummary,
          includeGenericWriteIn,
        })
      : contest.type === 'yesno'
      ? getEmptyYesNoContestResults(contest)
      : getEmptyCandidateContestResults(contest, includeGenericWriteIn);
  }

  return electionContestResults;
}

/**
 * Builds a manual results object with the specified metadata and tallies. Used
 * as a shorthanded means of defining manual results for comparison in testing.
 */
export function buildManualResultsFixture({
  election,
  ballotCount,
  contestResultsSummaries,
}: {
  election: Election;
  ballotCount: number;
  contestResultsSummaries: ContestResultsSummaries;
}): Tabulation.ManualElectionResults {
  return {
    ballotCount,
    contestResults: buildElectionContestResultsFixture({
      election,
      contestResultsSummaries,
      includeGenericWriteIn: false,
    }),
  };
}

/**
 * Builds an election results object with the specified metadata and tallies. Used
 * as a shorthanded means of defining manual results for comparison in testing.
 */
export function buildElectionResultsFixture({
  election,
  contestResultsSummaries,
  cardCounts,
  includeGenericWriteIn,
}: {
  election: Election;
  cardCounts: Tabulation.CardCounts;
  contestResultsSummaries: Record<ContestId, ContestResultsSummary>;
  includeGenericWriteIn: boolean;
}): Tabulation.ElectionResults {
  return {
    cardCounts,
    contestResults: buildElectionContestResultsFixture({
      election,
      contestResultsSummaries,
      includeGenericWriteIn,
    }),
  };
}

/**
 * Combine all specific write-ins for specific candidates into a single
 * generic write-in tally.
 */
export function mergeWriteInTallies<
  T extends Pick<Tabulation.ElectionResults, 'contestResults'>,
>(anyResults: T): T {
  const newElectionContestResults: Tabulation.ManualElectionResults['contestResults'] =
    {};

  for (const contestResults of Object.values(anyResults.contestResults)) {
    if (contestResults.contestType === 'yesno') {
      newElectionContestResults[contestResults.contestId] = contestResults;
      continue;
    }

    const newTallies: Tabulation.CandidateContestResults['tallies'] = {};

    let writeInTally = 0;
    for (const candidateTally of Object.values(contestResults.tallies)) {
      if (!candidateTally.isWriteIn) {
        newTallies[candidateTally.id] = candidateTally;
      } else {
        writeInTally += candidateTally.tally;
      }
    }

    if (writeInTally > 0) {
      newTallies[Tabulation.GENERIC_WRITE_IN_ID] = {
        ...Tabulation.GENERIC_WRITE_IN_CANDIDATE,
        tally: writeInTally,
      };
    }

    newElectionContestResults[contestResults.contestId] = {
      ...contestResults,
      tallies: newTallies,
    };
  }

  return {
    // eslint-disable-next-line vx/gts-spread-like-types
    ...anyResults,
    contestResults: newElectionContestResults,
  };
}

/**
 * Validates that the number of votes entered for the contest matches the number
 * of ballots.
 */
export function areContestResultsValid(
  contestResults: Tabulation.ContestResults
): boolean {
  const votesAllowed =
    contestResults.contestType === 'yesno' ? 1 : contestResults.votesAllowed;
  const expectedVotes = contestResults.ballots * votesAllowed;
  const tallyVotes =
    contestResults.overvotes +
    contestResults.undervotes +
    (contestResults.contestType === 'yesno'
      ? contestResults.yesTally + contestResults.noTally
      : iter(Object.values(contestResults.tallies)).sum(({ tally }) => tally));

  return tallyVotes === expectedVotes;
}
