import {
  AnyContest,
  ContestId,
  Election,
  ElectionDefinition,
  Id,
  Tabulation,
} from '@votingworks/types';
import {
  CachedElectionLookups,
  GROUP_KEY_ROOT,
  extractGroupSpecifier,
  getGroupKey,
  isGroupByEmpty,
} from '@votingworks/utils';
import { assert, assertDefined } from '@votingworks/basics';
import { WriteInForTally, WriteInTally } from '../types';
import { Store } from '../store';
import { extractWriteInSummary, tabulateManualResults } from './manual_results';
import { rootDebug } from '../util/debug';

const debug = rootDebug.extend('write-ins-tabulation');

/**
 * Creates an empty contest write-in summary.
 */
export function getEmptyContestWriteInSummary(
  contestId: ContestId
): Tabulation.ContestWriteInSummary {
  return {
    contestId,
    totalTally: 0,
    pendingTally: 0,
    invalidTally: 0,
    candidateTallies: {},
  };
}

/**
 * Creates an empty election write-in summary with empty contest write-in
 * summaries for all contests allowing write-ins.
 */
export function getEmptyElectionWriteInSummary(
  election: Election
): Tabulation.ElectionWriteInSummary {
  const electionWriteInSummary: Tabulation.ElectionWriteInSummary = {
    contestWriteInSummaries: {},
  };
  for (const contest of election.contests) {
    if (contest.type === 'candidate' && contest.allowWriteIns) {
      electionWriteInSummary.contestWriteInSummaries[contest.id] =
        getEmptyContestWriteInSummary(contest.id);
    }
  }

  return electionWriteInSummary;
}

/**
 * Convert from a contest write-in summary back to the write-in tally records
 * that would be retrieved from the store. For testing purposes only.
 */
export function convertContestWriteInSummaryToWriteInTallies(
  contestWriteInSummary: Tabulation.GroupOf<Tabulation.ContestWriteInSummary>
): Array<Tabulation.GroupOf<WriteInTally>> {
  const writeInTallies: Array<Tabulation.GroupOf<WriteInTally>> = [];
  const groupSpecifier = extractGroupSpecifier(contestWriteInSummary);

  const { contestId, pendingTally, invalidTally, candidateTallies } =
    contestWriteInSummary;

  if (pendingTally > 0) {
    writeInTallies.push({
      ...groupSpecifier,
      contestId,
      status: 'pending',
      tally: pendingTally,
    });
  }

  if (invalidTally > 0) {
    writeInTallies.push({
      ...groupSpecifier,
      contestId,
      status: 'adjudicated',
      adjudicationType: 'invalid',
      tally: invalidTally,
    });
  }

  for (const candidateTally of Object.values(candidateTallies)) {
    writeInTallies.push({
      ...groupSpecifier,
      contestId,
      status: 'adjudicated',
      adjudicationType: candidateTally.isWriteIn
        ? 'write-in-candidate'
        : 'official-candidate',
      candidateId: candidateTally.id,
      candidateName: candidateTally.name,
      tally: candidateTally.tally,
    });
  }

  return writeInTallies;
}

/**
 * Adds a {@link WriteInForTally} into a {@link Tabulation.ElectionWriteInSummary}.
 * Modifies the summary in place! Do not export.
 */
function addWriteInToElectionWriteInSummary({
  store,
  electionId,
  electionDefinition,
  electionWriteInSummary,
  writeIn,
  // Whether to include pending write-ins that don't contribute to tallies
  // (i.e. pending unmarked write-ins, pending write-ins part of overvotes)
  includeUnallocablePendingWriteInsAsPending,
}: {
  store: Store;
  electionId: Id;
  electionDefinition: ElectionDefinition;
  electionWriteInSummary: Tabulation.ElectionWriteInSummary;
  writeIn: WriteInForTally;
  includeUnallocablePendingWriteInsAsPending: boolean;
}): Tabulation.ElectionWriteInSummary {
  const {
    contestId,
    cvrId,
    officialCandidateId,
    writeInCandidateId,
    candidateName,
  } = writeIn;
  const contestWriteInSummary =
    electionWriteInSummary.contestWriteInSummaries[contestId];
  assert(contestWriteInSummary);

  // Total number of write-ins, regardless of overvote status
  contestWriteInSummary.totalTally += 1;

  if (writeIn.isInvalid) {
    contestWriteInSummary.invalidTally += 1;
    return electionWriteInSummary;
  }

  const [cvr] = store.getCastVoteRecords({ electionId, cvrId, filter: {} });
  const votes = assertDefined(assertDefined(cvr).votes[contestId]);

  const contest = CachedElectionLookups.getContestById(
    electionDefinition,
    contestId
  );
  assert(contest.type === 'candidate');

  const isPending = officialCandidateId === null && writeInCandidateId === null;
  const isOvervote = votes.length > contest.seats;
  if (isOvervote) {
    // Special case handling: If includeUnallocablePendingWriteInsAsPending is true, treat
    // pending write-in as pending even if part of an overvote, rather than invalid (used
    // for WIA report). Post-adjudication, it will be counted as invalid if the overvote holds
    if (isPending && includeUnallocablePendingWriteInsAsPending) {
      contestWriteInSummary.pendingTally += 1;
    } else {
      contestWriteInSummary.invalidTally += 1;
    }
    return electionWriteInSummary;
  }

  if (isPending) {
    // Special NH case handling: If includeUnallocablePendingWriteInsAsPending is false,
    // ignore pending unmarked write-ins (required for tally report)
    if (writeIn.isUnmarked && !includeUnallocablePendingWriteInsAsPending) {
      return electionWriteInSummary;
    }
    contestWriteInSummary.pendingTally += 1;
    return electionWriteInSummary;
  }

  // Since it is not pending or invalid, it must be adjudicated for a candidate
  assert(candidateName !== null);

  if (officialCandidateId) {
    const tally =
      (contestWriteInSummary.candidateTallies[officialCandidateId]?.tally ??
        0) + 1;
    contestWriteInSummary.candidateTallies[officialCandidateId] = {
      tally,
      name: candidateName,
      id: officialCandidateId,
      isWriteIn: false,
    };
    return electionWriteInSummary;
  }

  // Must be adjudicated for a write-in candidate
  assert(writeInCandidateId !== null);
  const tally =
    (contestWriteInSummary.candidateTallies[writeInCandidateId]?.tally ?? 0) +
    1;
  contestWriteInSummary.candidateTallies[writeInCandidateId] = {
    tally,
    name: candidateName,
    id: writeInCandidateId,
    isWriteIn: true,
  };
  return electionWriteInSummary;
}

/**
 * Tabulates write-in tallies aggregated by the store into write-in summaries
 * organized by contest and the optional `groupBy` parameter.
 */
export function tabulateWriteInTallies({
  electionId,
  store,
  filter,
  groupBy,
  includeUnallocablePendingWriteInsAsPending = false,
}: {
  electionId: Id;
  store: Store;
  filter?: Tabulation.Filter;
  groupBy?: Tabulation.GroupBy;
  // Whether to include pending write-ins that don't contribute to tallies
  // i.e. pending unmarked write-ins, write-ins part of overvotes. Defaults to
  // false for regular tabulations, set to true for overall WIA summary report
  includeUnallocablePendingWriteInsAsPending?: boolean;
}): Tabulation.GroupMap<Tabulation.ElectionWriteInSummary> {
  const { electionDefinition } = assertDefined(store.getElection(electionId));
  const { election } = electionDefinition;

  const writeIns = store.getWriteInsForTallies({
    election,
    electionId,
    filter,
    groupBy,
  });

  const electionWriteInSummaryGroupMap: Tabulation.GroupMap<Tabulation.ElectionWriteInSummary> =
    {};

  // optimized special case, when the results do not need to be grouped
  if (!groupBy || isGroupByEmpty(groupBy)) {
    const electionWriteInSummary = getEmptyElectionWriteInSummary(election);
    for (const writeIn of writeIns) {
      addWriteInToElectionWriteInSummary({
        store,
        electionId,
        electionDefinition,
        electionWriteInSummary,
        writeIn,
        includeUnallocablePendingWriteInsAsPending,
      });
    }
    electionWriteInSummaryGroupMap[GROUP_KEY_ROOT] = electionWriteInSummary;
    return electionWriteInSummaryGroupMap;
  }

  // general case, grouping results by specified group by clause
  for (const writeIn of writeIns) {
    const groupKey = getGroupKey(writeIn, groupBy);

    const existingSummary = electionWriteInSummaryGroupMap[groupKey];
    const summary = existingSummary ?? getEmptyElectionWriteInSummary(election);

    electionWriteInSummaryGroupMap[groupKey] =
      addWriteInToElectionWriteInSummary({
        store,
        electionId,
        electionDefinition,
        electionWriteInSummary: summary,
        writeIn,
        includeUnallocablePendingWriteInsAsPending,
      });
  }

  return electionWriteInSummaryGroupMap;
}

/**
 * Modify an election results object generated from CVRs with write-in
 * adjudication data from the write-in table. Before modifying, contests with
 * write-ins will only contain a generic write-in tally. Modification will add
 * write-ins adjudicated for official candidates to their official counts and add
 * distinct counts for unofficial candidates.
 */
export function modifyElectionResultsWithWriteInSummary(
  results: Tabulation.ElectionResults,
  writeInSummary: Tabulation.ElectionWriteInSummary
): Tabulation.ElectionResults {
  const modifiedElectionResults: Tabulation.ElectionResults = {
    ...results,
    contestResults: {},
  };

  for (const [contestId, contestResults] of Object.entries(
    results.contestResults
  )) {
    const contestWriteInSummary =
      writeInSummary.contestWriteInSummaries[contestId];

    // if the contest does not allow write-ins, there is nothing to modify
    if (
      !(contestResults.contestType === 'candidate') ||
      !contestWriteInSummary
    ) {
      modifiedElectionResults.contestResults[contestId] = contestResults;
      continue;
    }

    // if the contest does allow write-ins, create modified contest results
    const modifiedCandidateTallies: Tabulation.CandidateContestResults['tallies'] =
      {};

    for (const [candidateId, candidateTally] of Object.entries(
      contestResults.tallies
    )) {
      if (!candidateTally.isWriteIn) {
        // add write-in tallies for official candidates to their existing tallies
        modifiedCandidateTallies[candidateId] = {
          ...candidateTally,
          tally:
            candidateTally.tally +
            (contestWriteInSummary.candidateTallies[candidateId]?.tally ?? 0),
        };
      } else {
        // include the pending write-in count as a "pending write-in candidate"
        if (contestWriteInSummary.pendingTally > 0) {
          modifiedCandidateTallies[candidateId] = {
            ...Tabulation.PENDING_WRITE_IN_CANDIDATE,
            tally: contestWriteInSummary.pendingTally,
          };
        }

        // write-ins adjudicated for non-official candidates should be added
        // as unique tallies for each non-official candidate
        const writeInCandidateTallies = Object.values(
          contestWriteInSummary.candidateTallies
        ).filter((ct) => ct.isWriteIn);

        for (const writeInCandidateTally of writeInCandidateTallies) {
          modifiedCandidateTallies[writeInCandidateTally.id] =
            writeInCandidateTally;
        }
      }
    }

    modifiedElectionResults.contestResults[contestId] = {
      contestId: contestResults.contestId,
      contestType: contestResults.contestType,
      votesAllowed: contestResults.votesAllowed,
      ballots: contestResults.ballots,
      overvotes: contestResults.overvotes,
      undervotes: contestResults.undervotes,
      tallies: modifiedCandidateTallies,
    };
  }

  return modifiedElectionResults;
}

function combineContestWriteInSummaries(
  summaryA: Tabulation.ContestWriteInSummary,
  summaryB: Tabulation.ContestWriteInSummary,
  contest: AnyContest
): Tabulation.ContestWriteInSummary {
  const combinedCandidateTallies: Tabulation.ContestWriteInSummary['candidateTallies'] =
    {};

  const allCandidateIds = [
    ...new Set([
      ...Object.keys(summaryA.candidateTallies),
      ...Object.keys(summaryB.candidateTallies),
    ]),
  ];
  for (const candidateId of allCandidateIds) {
    const candidateTallyA = summaryA.candidateTallies[candidateId];
    const candidateTallyB = summaryB.candidateTallies[candidateId];
    const candidateTallyMetadata = candidateTallyA || candidateTallyB;
    assert(candidateTallyMetadata);
    combinedCandidateTallies[candidateId] = {
      ...candidateTallyMetadata,
      tally: (candidateTallyA?.tally ?? 0) + (candidateTallyB?.tally ?? 0),
    };
  }

  return {
    contestId: contest.id,
    pendingTally: summaryA.pendingTally + summaryB.pendingTally,
    invalidTally: summaryA.invalidTally + summaryB.invalidTally,
    totalTally: summaryA.totalTally + summaryB.totalTally,
    candidateTallies: combinedCandidateTallies,
  };
}

/**
 * Merge two election write-in summaries.
 */
export function combineElectionWriteInSummaries(
  summaryA: Tabulation.ElectionWriteInSummary,
  summaryB: Tabulation.ElectionWriteInSummary,
  election: Election
): Tabulation.ElectionWriteInSummary {
  const combinedSummary: Tabulation.ElectionWriteInSummary = {
    contestWriteInSummaries: {},
  };

  const writeInContests = election.contests.filter(
    (c) => c.type === 'candidate' && c.allowWriteIns
  );

  for (const contest of writeInContests) {
    const contestSummaryA = summaryA.contestWriteInSummaries[contest.id];
    const contestSummaryB = summaryB.contestWriteInSummaries[contest.id];

    if (contestSummaryA && contestSummaryB) {
      combinedSummary.contestWriteInSummaries[contest.id] =
        combineContestWriteInSummaries(
          contestSummaryA,
          contestSummaryB,
          contest
        );
    } else if (contestSummaryA) {
      combinedSummary.contestWriteInSummaries[contest.id] = contestSummaryA;
    } else if (contestSummaryB) {
      combinedSummary.contestWriteInSummaries[contest.id] = contestSummaryB;
    }
  }

  return combinedSummary;
}

/**
 * Get the overall election write-in summary, including write-in candidate tallies
 * from manual results if applicable.
 */
export function getOverallElectionWriteInSummary({
  electionId,
  store,
}: {
  electionId: Id;
  store: Store;
}): Tabulation.ElectionWriteInSummary {
  debug('tabulating overall election write-in summary');
  const {
    electionDefinition: { election },
  } = assertDefined(store.getElection(electionId));

  const scannedElectionWriteInSummary = Object.values(
    tabulateWriteInTallies({
      electionId,
      store,
      includeUnallocablePendingWriteInsAsPending: true,
    })
  )[0];
  assert(scannedElectionWriteInSummary);

  const overallManualResults = Object.values(
    tabulateManualResults({ electionId, store }).unsafeUnwrap()
  )[0];

  if (!overallManualResults) return scannedElectionWriteInSummary;

  const overallManualWriteInSummary = extractWriteInSummary({
    election,
    manualResults: overallManualResults,
  });

  debug('tabulated overall election write-in-summary');
  return combineElectionWriteInSummaries(
    scannedElectionWriteInSummary,
    overallManualWriteInSummary,
    election
  );
}
