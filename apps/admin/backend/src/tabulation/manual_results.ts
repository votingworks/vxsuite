import { Election, Tabulation } from '@votingworks/types';
import {
  combineManualElectionResults,
  getBallotStyleIdPartyIdLookup,
  getGroupKey,
} from '@votingworks/utils';
import { Result, assert, err, ok } from '@votingworks/basics';
import {
  ManualResultsFilter,
  ManualResultsGroupBy,
  ManualResultsRecord,
} from '../types';
import { Store } from '../store';
import { replacePartyIdFilter } from './utils';

/**
 * Aggregates an iterable list of manual results records into one or many
 * combined manual results based on the specified grouping.
 */
export function aggregateManualResults({
  election,
  manualResultsRecords,
  groupBy = {},
}: {
  election: Election;
  manualResultsRecords: Iterable<ManualResultsRecord>;
  groupBy?: ManualResultsGroupBy;
}): Tabulation.Grouped<Tabulation.ManualElectionResults> {
  const groupedManualResults: Tabulation.Grouped<Tabulation.ManualElectionResults> =
    {};

  const ballotStyleIdPartyIdLookup = getBallotStyleIdPartyIdLookup(election);

  for (const manualResultsRecord of manualResultsRecords) {
    const groupKey = getGroupKey(
      {
        ...manualResultsRecord,
        // must include party id for the case where that's the grouping
        partyId: ballotStyleIdPartyIdLookup[manualResultsRecord.ballotStyleId],
      },
      groupBy
    );
    const existingGroup = groupedManualResults[groupKey];
    if (existingGroup) {
      groupedManualResults[groupKey] = combineManualElectionResults({
        election,
        allManualResults: [existingGroup, manualResultsRecord.manualResults],
      });
    } else {
      groupedManualResults[groupKey] = manualResultsRecord.manualResults;
    }
  }

  return groupedManualResults;
}

/**
 * Type guard for filters to check if they are compatible with manual results.
 */
export function isFilterCompatibleWithManualResults(
  filter: Tabulation.Filter
): filter is ManualResultsFilter {
  return !filter.batchIds && !filter.scannerIds;
}

/**
 * Type guard for group by to check if it is compatible with manual results.
 */
export function isGroupByCompatibleWithManualResults(
  groupBy: Tabulation.GroupBy
): groupBy is ManualResultsGroupBy {
  return !groupBy.groupByBatch && !groupBy.groupByScanner;
}

type GetManualResultsError =
  | { type: 'incompatible-filter' }
  | { type: 'incompatible-group-by' };

/**
 * Return aggregated manual results, filtered and grouped.
 */
export function getManualResults({
  store,
  filter = {},
  groupBy = {},
}: {
  store: Store;
  filter?: Tabulation.Filter;
  groupBy?: Tabulation.GroupBy;
}): Result<
  Tabulation.Grouped<Tabulation.ManualElectionResults>,
  GetManualResultsError
> {
  if (!isFilterCompatibleWithManualResults(filter)) {
    return err({ type: 'incompatible-filter' });
  }

  if (!isGroupByCompatibleWithManualResults(groupBy)) {
    return err({ type: 'incompatible-group-by' });
  }

  const electionId = store.getCurrentElectionId();
  assert(electionId !== undefined);
  const electionRecord = store.getElection(electionId);
  assert(electionRecord);
  const {
    electionDefinition: { election },
  } = electionRecord;

  const manualResultsRecords = store.getManualResults({
    electionId,
    ...replacePartyIdFilter(filter, election),
  });

  return ok(
    aggregateManualResults({
      election,
      manualResultsRecords,
      groupBy,
    })
  );
}
