import { Election, Id, Tabulation } from '@votingworks/types';
import {
  BallotStyleIdPartyIdLookup,
  combineManualElectionResults,
  getBallotStyleIdPartyIdLookup,
  getGroupKey,
} from '@votingworks/utils';
import { Result, assertDefined, err, ok } from '@votingworks/basics';
import {
  ManualResultsFilter,
  ManualResultsGroupBy,
  ManualResultsRecord,
} from '../types';
import { Store } from '../store';
import { replacePartyIdFilter } from './utils';

function getManualResultsGroupSpecifier(
  manualResultsRecord: ManualResultsRecord,
  groupBy: ManualResultsGroupBy,
  partyIdLookup: BallotStyleIdPartyIdLookup
): Tabulation.GroupSpecifier {
  return {
    ballotStyleId: groupBy.groupByBallotStyle
      ? manualResultsRecord.ballotStyleId
      : undefined,
    partyId: groupBy.groupByParty
      ? partyIdLookup[manualResultsRecord.ballotStyleId]
      : undefined,
    precinctId: groupBy.groupByPrecinct
      ? manualResultsRecord.precinctId
      : undefined,
    votingMethod: groupBy.groupByVotingMethod
      ? manualResultsRecord.votingMethod
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
    const groupSpecifier = getManualResultsGroupSpecifier(
      manualResultsRecord,
      groupBy,
      ballotStyleIdPartyIdLookup
    );
    const groupKey = getGroupKey(groupSpecifier, groupBy);
    const existingGroup = groupedManualResults[groupKey];
    if (existingGroup) {
      groupedManualResults[groupKey] = {
        ...groupSpecifier,
        ...combineManualElectionResults({
          election,
          allManualResults: [existingGroup, manualResultsRecord.manualResults],
        }),
      };
    } else {
      groupedManualResults[groupKey] = {
        ...groupSpecifier,
        ...manualResultsRecord.manualResults,
      };
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

  const {
    electionDefinition: { election },
  } = assertDefined(store.getElection(electionId));

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
