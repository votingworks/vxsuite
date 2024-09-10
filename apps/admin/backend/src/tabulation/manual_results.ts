import { Admin, Election, Id, Tabulation } from '@votingworks/types';
import {
  BallotStyleIdPartyIdLookup,
  combineManualElectionResults,
  getBallotStyleIdPartyIdLookup,
  getGroupKey,
} from '@votingworks/utils';
import { Result, assert, assertDefined, err, ok } from '@votingworks/basics';
import {
  ManualResultsFilter,
  ManualResultsIdentifier,
  ManualResultsRecord,
} from '../types';
import { Store } from '../store';

function getManualResultsGroupSpecifier(
  manualResultsIdentifier: ManualResultsIdentifier,
  groupBy: Tabulation.GroupBy,
  partyIdLookup: BallotStyleIdPartyIdLookup
): Tabulation.GroupSpecifier {
  return {
    ballotStyleId: groupBy.groupByBallotStyle
      ? manualResultsIdentifier.ballotStyleId
      : undefined,
    partyId: groupBy.groupByParty
      ? partyIdLookup[manualResultsIdentifier.ballotStyleId]
      : undefined,
    precinctId: groupBy.groupByPrecinct
      ? manualResultsIdentifier.precinctId
      : undefined,
    votingMethod: groupBy.groupByVotingMethod
      ? manualResultsIdentifier.votingMethod
      : undefined,
    batchId: groupBy.groupByBatch ? Tabulation.MANUAL_BATCH_ID : undefined,
    scannerId: groupBy.groupByScanner
      ? Tabulation.MANUAL_SCANNER_ID
      : undefined,
  };
}

/**
 * Aggregates an iterable list of manual results records into one or many
 * combined manual results based on the specified grouping.
 */
export function aggregateManualResults(params: {
  election: Election;
  manualResultsRecords: Iterable<ManualResultsRecord>;
  groupBy?: Tabulation.GroupBy;
}): Tabulation.ManualResultsGroupMap {
  /* istanbul ignore next */
  const { election, manualResultsRecords, groupBy = {} } = params;
  const manualResultsGroupMap: Tabulation.ManualResultsGroupMap = {};

  const ballotStyleIdPartyIdLookup = getBallotStyleIdPartyIdLookup(election);

  for (const manualResultsRecord of manualResultsRecords) {
    const groupSpecifier = getManualResultsGroupSpecifier(
      manualResultsRecord,
      groupBy,
      ballotStyleIdPartyIdLookup
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
  filter: Admin.ReportingFilter
): filter is ManualResultsFilter {
  return (
    !filter.batchIds &&
    !filter.scannerIds &&
    !(filter.adjudicationFlags && filter.adjudicationFlags.length > 0)
  );
}

interface GetManualResultsError {
  type: 'incompatible-filter';
}

/**
 * Filters, groups, and aggregates manual results.
 */
export function tabulateManualResults({
  electionId,
  store,
  filter = {},
  groupBy = {},
}: {
  electionId: Id;
  store: Store;
  filter?: Admin.ReportingFilter;
  groupBy?: Tabulation.GroupBy;
}): Result<Tabulation.ManualResultsGroupMap, GetManualResultsError> {
  if (!isFilterCompatibleWithManualResults(filter)) {
    return err({ type: 'incompatible-filter' });
  }

  const {
    electionDefinition: { election },
  } = assertDefined(store.getElection(electionId));

  const manualResultsRecords = store.getManualResults({
    electionId,
    filter,
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
  electionId,
  store,
  filter = {},
  groupBy = {},
}: {
  electionId: Id;
  store: Store;
  filter?: Admin.ReportingFilter;
  groupBy?: Tabulation.GroupBy;
}): Result<Tabulation.ManualBallotCountsGroupMap, GetManualResultsError> {
  if (!isFilterCompatibleWithManualResults(filter)) {
    return err({ type: 'incompatible-filter' });
  }

  const {
    electionDefinition: { election },
  } = assertDefined(store.getElection(electionId));
  const ballotStyleIdPartyIdLookup = getBallotStyleIdPartyIdLookup(election);

  const manualResultsMetadataRecords = store.getManualResultsMetadata({
    electionId,
    filter,
  });

  const manualBallotCountGroupMap: Tabulation.ManualBallotCountsGroupMap = {};
  for (const manualResultsMetadataRecord of manualResultsMetadataRecords) {
    const groupSpecifier = getManualResultsGroupSpecifier(
      manualResultsMetadataRecord,
      groupBy,
      ballotStyleIdPartyIdLookup
    );
    const groupKey = getGroupKey(groupSpecifier, groupBy);

    manualBallotCountGroupMap[groupKey] =
      (manualBallotCountGroupMap[groupKey] ?? 0) +
      manualResultsMetadataRecord.ballotCount;
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
