import { ContestId, Election, Tabulation } from '@votingworks/types';
import {
  GROUP_KEY_ROOT,
  extractGroupSpecifier,
  getGroupKey,
  isGroupByEmpty,
  tabulateCastVoteRecords,
} from '@votingworks/utils';
import { assert, throwIllegalValue } from '@votingworks/basics';
import {
  ContestWriteInSummary,
  WriteInTally,
  ElectionWriteInSummary,
} from './types';
import { Store } from './store';

/**
 * Creates an empty contest write-in summary.
 */
export function getEmptyContestWriteInSummary(
  contestId: ContestId
): ContestWriteInSummary {
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
): ElectionWriteInSummary {
  const electionWriteInSummary: ElectionWriteInSummary = {
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
  contestWriteInSummary: Tabulation.GroupOf<ContestWriteInSummary>
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
 * Adds a {@link WriteInTally} into a {@link ElectionWriteInSummary}. Modifies
 * the summary in place! Do not export. Write-in tallies of the same type (e.g.)
 * invalid, pending, or for a specific candidate do not accumulate, they simply
 * overwrite existing values. This is because we only expect one of each type
 * from the store.
 */
function addWriteInTallyToElectionWriteInSummary({
  writeInTally,
  electionWriteInSummary,
}: {
  electionWriteInSummary: ElectionWriteInSummary;
  writeInTally: WriteInTally;
}): ElectionWriteInSummary {
  const contestWriteInSummary =
    electionWriteInSummary.contestWriteInSummaries[writeInTally.contestId];
  assert(contestWriteInSummary);

  contestWriteInSummary.totalTally += writeInTally.tally;

  if (writeInTally.status === 'pending') {
    contestWriteInSummary.pendingTally += writeInTally.tally;
  } else if (writeInTally.adjudicationType === 'invalid') {
    contestWriteInSummary.invalidTally += writeInTally.tally;
  } else if (writeInTally.adjudicationType === 'official-candidate') {
    contestWriteInSummary.candidateTallies[writeInTally.candidateId] = {
      tally: writeInTally.tally,
      name: writeInTally.candidateName,
      id: writeInTally.candidateId,
      isWriteIn: false,
    };
  } else if (writeInTally.adjudicationType === 'write-in-candidate') {
    contestWriteInSummary.candidateTallies[writeInTally.candidateId] = {
      tally: writeInTally.tally,
      name: writeInTally.candidateName,
      id: writeInTally.candidateId,
      isWriteIn: true,
    };
  } else {
    throwIllegalValue(writeInTally);
  }

  return electionWriteInSummary;
}

/**
 * Tabulates write-in tallies aggregated by the store into write-in summaries
 * organized by contest and the optional `groupBy` parameter.
 */
export function tabulateWriteInTallies({
  election,
  writeInTallies,
  groupBy,
}: {
  election: Election;
  writeInTallies: Iterable<Tabulation.GroupOf<WriteInTally>>;
  groupBy?: Tabulation.GroupBy;
}): Tabulation.Grouped<ElectionWriteInSummary> {
  const groupedElectionWriteInSummaries: Record<
    string,
    ElectionWriteInSummary
  > = {};

  // optimized special case, when the results do not need to be grouped
  if (!groupBy || isGroupByEmpty(groupBy)) {
    const electionWriteInSummary = getEmptyElectionWriteInSummary(election);
    for (const writeInTally of writeInTallies) {
      addWriteInTallyToElectionWriteInSummary({
        writeInTally,
        electionWriteInSummary,
      });
    }
    groupedElectionWriteInSummaries[GROUP_KEY_ROOT] = electionWriteInSummary;
    return groupedElectionWriteInSummaries;
  }

  // general case, grouping results by specified group by clause
  for (const writeInTally of writeInTallies) {
    const groupKey = getGroupKey(writeInTally, groupBy);

    const existingSummary = groupedElectionWriteInSummaries[groupKey];
    const summary = existingSummary ?? {
      ...getEmptyElectionWriteInSummary(election),
      ...extractGroupSpecifier(writeInTally),
    };

    groupedElectionWriteInSummaries[groupKey] =
      addWriteInTallyToElectionWriteInSummary({
        writeInTally,
        electionWriteInSummary: summary,
      });
  }

  return groupedElectionWriteInSummaries;
}

/**
 * Modify an election results object generated from CVRs with write-in
 * adjudication data from the write-in table. Before modifying, contests with
 * write-ins will only contain a generic write-in tally. Modification will add
 * write-ins adjudicated for official candidates to their official counts, add
 * distinct counts for unofficial candidates, and treat invalid write-ins as
 * undervotes.
 */
export function modifyElectionResultsWithWriteInSummary(
  results: Tabulation.ElectionResults,
  writeInSummary: ElectionWriteInSummary
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
        // the generic write-in candidate now only represents pending write-ins
        if (contestWriteInSummary.pendingTally > 0) {
          modifiedCandidateTallies[candidateId] = {
            ...candidateTally,
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
      undervotes:
        contestResults.undervotes + contestWriteInSummary.invalidTally,
      tallies: modifiedCandidateTallies,
    };
  }

  return modifiedElectionResults;
}

/**
 * Tabulate election results including all scanned and adjudicated information.
 */
export function tabulateElectionResults({
  store,
  filter = {},
  groupBy = {},
  includeWriteInAdjudicationResults,
}: {
  store: Store;
  filter?: Tabulation.Filter;
  groupBy?: Tabulation.GroupBy;
  includeWriteInAdjudicationResults: boolean;
}): Tabulation.GroupedElectionResults {
  const electionId = store.getCurrentElectionId();
  assert(electionId !== undefined);
  const electionRecord = store.getElection(electionId);
  assert(electionRecord);
  const {
    electionDefinition: { election },
  } = electionRecord;

  const groupedElectionResults = tabulateCastVoteRecords({
    cvrs: store.getCastVoteRecords({ electionId, election, filter }),
    election,
    groupBy,
  });

  if (!includeWriteInAdjudicationResults) {
    return groupedElectionResults;
  }

  const groupedWriteInSummaries = tabulateWriteInTallies({
    election,
    writeInTallies: store.getWriteInTalliesForTabulation({
      electionId,
      election,
      filter,
      groupBy,
    }),
    groupBy,
  });

  for (const [
    groupKey,
    electionResultsWithoutWriteInAdjudicationData,
  ] of Object.entries(groupedElectionResults)) {
    const writeInSummary = groupedWriteInSummaries[groupKey];
    if (writeInSummary) {
      groupedElectionResults[groupKey] =
        modifyElectionResultsWithWriteInSummary(
          electionResultsWithoutWriteInAdjudicationData,
          writeInSummary
        );
    }
  }

  return groupedElectionResults;
}
