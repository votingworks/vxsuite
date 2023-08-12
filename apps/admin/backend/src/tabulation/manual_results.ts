import { Election, Id, Tabulation } from '@votingworks/types';
import {
  combineManualElectionResults,
  getGroupKey,
  getTrivialFundamentalFilter,
  getTrivialFundamentalGroupBy,
} from '@votingworks/utils';
import { Result, assert, assertDefined, err, ok } from '@votingworks/basics';
import {
  ManualResultsFundamentalFilter,
  ManualResultsGroupBy,
  ManualResultsIdentifier,
  ManualResultsMetadataRecord,
  ManualResultsRecord,
} from '../types';
import { Store } from '../store';

function getManualResultsGroupSpecifier(
  manualResultsIdentifier: ManualResultsIdentifier,
  groupBy: ManualResultsGroupBy
): Tabulation.FundamentalGroupSpecifier {
  return {
    isFundamental: true,
    ballotStyleId: groupBy.groupByBallotStyle
      ? manualResultsIdentifier.ballotStyleId
      : undefined,
    precinctId: groupBy.groupByPrecinct
      ? manualResultsIdentifier.precinctId
      : undefined,
    votingMethod: groupBy.groupByVotingMethod
      ? manualResultsIdentifier.votingMethod
      : undefined,
  };
}

/**
 * Aggregates an iterable list of manual results records into one or many
 * combined manual results based on the specified grouping.
 */
export function aggregateManualResults({
  election,
  manualResultsRecords,
  groupBy = getTrivialFundamentalFilter(),
}: {
  election: Election;
  manualResultsRecords: Iterable<ManualResultsRecord>;
  groupBy?: ManualResultsGroupBy;
}): Tabulation.ManualResultsGroupMap {
  const manualResultsGroupMap: Tabulation.ManualResultsGroupMap = {};

  for (const manualResultsRecord of manualResultsRecords) {
    const groupSpecifier = getManualResultsGroupSpecifier(
      manualResultsRecord,
      groupBy
    );
    const groupKey = getGroupKey(groupSpecifier, groupBy);
    const existingGroup = manualResultsGroupMap[groupKey];
    if (existingGroup) {
      manualResultsGroupMap[groupKey] = combineManualElectionResults({
        election,
        allManualResults: [existingGroup, manualResultsRecord.manualResults],
      });
    } else {
      manualResultsGroupMap[groupKey] = manualResultsRecord.manualResults;
    }
  }

  return manualResultsGroupMap;
}

/**
 * Type guard for filters to check if they are compatible with manual results.
 */
export function isFilterCompatibleWithManualResults(
  filter: Tabulation.FundamentalFilter
): filter is ManualResultsFundamentalFilter {
  return !filter.batchIds;
}

/**
 * Type guard for group by to check if it is compatible with manual results.
 */
export function isGroupByCompatibleWithManualResults(
  groupBy: Tabulation.FundamentalGroupBy
): groupBy is ManualResultsGroupBy {
  return !groupBy.groupByBatch;
}

type GetManualResultsError =
  | { type: 'incompatible-filter' }
  | { type: 'incompatible-group-by' };

/**
 * Filters, groups, and aggregates manual results.
 */
export function tabulateManualResults({
  electionId,
  store,
  filter = getTrivialFundamentalFilter(),
  groupBy = getTrivialFundamentalGroupBy(),
}: {
  electionId: Id;
  store: Store;
  filter?: Tabulation.FundamentalFilter;
  groupBy?: Tabulation.FundamentalGroupBy;
}): Result<Tabulation.ManualResultsGroupMap, GetManualResultsError> {
  if (!isFilterCompatibleWithManualResults(filter)) {
    return err({ type: 'incompatible-filter' });
  }

  if (!isGroupByCompatibleWithManualResults(groupBy)) {
    return err({ type: 'incompatible-group-by' });
  }

  const {
    electionDefinition: { election },
  } = assertDefined(store.getElection(electionId));

  const manualResultsRecords = store.getManualResults({
    electionId,
    ...filter,
  });

  return ok(
    aggregateManualResults({
      election,
      manualResultsRecords,
      groupBy,
    })
  );
}

/**
 * Tabulates manual ballot counts, optionally grouped. Returns error if the
 * group by is incompatible with manual results.
 */
export function tabulateManualBallotCounts({
  manualResultsMetadataRecords,
  groupBy = getTrivialFundamentalGroupBy(),
}: {
  election: Election;
  manualResultsMetadataRecords: Iterable<ManualResultsMetadataRecord>;
  groupBy?: Tabulation.FundamentalGroupBy;
}): Result<Tabulation.ManualBallotCountsGroupMap, GetManualResultsError> {
  if (!isGroupByCompatibleWithManualResults(groupBy)) {
    return err({ type: 'incompatible-group-by' });
  }

  const manualBallotCountGroupMap: Tabulation.ManualBallotCountsGroupMap = {};

  for (const manualResultsMetadataRecord of manualResultsMetadataRecords) {
    const groupSpecifier = getManualResultsGroupSpecifier(
      manualResultsMetadataRecord,
      groupBy
    );
    const groupKey = getGroupKey(groupSpecifier, groupBy);

    manualBallotCountGroupMap[groupKey] = {
      ballotCount:
        (manualBallotCountGroupMap[groupKey]?.ballotCount ?? 0) +
        manualResultsMetadataRecord.ballotCount,
    };
  }

  return ok(manualBallotCountGroupMap);
}

/**
 * Extract write-in candidate tallies from manual results in the form of
 * {@link Tabulation.ElectionWriteInSummary}. It's not possible to extract
 * pending, invalid, total, or official candidate tallies because those are
 * not specified by the user.
 */
export function extractWriteInSummary({
  election,
  manualResults,
}: {
  election: Election;
  manualResults: Tabulation.ManualElectionResults;
}): Tabulation.ElectionWriteInSummary {
  const electionManualWriteInSummary: Tabulation.ElectionWriteInSummary = {
    contestWriteInSummaries: {},
  };

  const writeInContests = election.contests.filter(
    (c) => c.type === 'candidate' && c.allowWriteIns
  );
  for (const contest of writeInContests) {
    const writeInCandidateTallies: Tabulation.ContestWriteInSummary['candidateTallies'] =
      {};

    const contestResults = manualResults.contestResults[contest.id];
    let totalTally = 0;
    if (contestResults) {
      assert(contestResults.contestType === 'candidate');
      for (const candidateTally of Object.values(contestResults.tallies)) {
        if (candidateTally.isWriteIn) {
          writeInCandidateTallies[candidateTally.id] = candidateTally;
          totalTally += candidateTally.tally;
        }
      }
    }

    electionManualWriteInSummary.contestWriteInSummaries[contest.id] = {
      contestId: contest.id,
      totalTally,
      pendingTally: 0,
      invalidTally: 0,
      candidateTallies: writeInCandidateTallies,
    };
  }

  return electionManualWriteInSummary;
}
