import { Tabulation } from '@votingworks/types';

/**
 * Possible metadata attributes that can be included in the CSV, in the order
 * the columns will appear in the CSV.
 */
export const CSV_METADATA_ATTRIBUTES = [
  'precinct',
  'party',
  'ballotStyle',
  'votingMethod',
  'scanner',
  'batch',
] as const;

type CsvMetadataAttribute = (typeof CSV_METADATA_ATTRIBUTES)[number];

/**
 * Labels for compound metadata filter columns, such as in the case where a
 * report filters on multiple precincts or multiple ballot styles.
 */
export const CSV_METADATA_ATTRIBUTE_MULTI_LABEL: Record<
  CsvMetadataAttribute,
  string
> = {
  precinct: 'Precincts',
  party: 'Parties',
  ballotStyle: 'Ballot Styles',
  votingMethod: 'Voting Methods',
  scanner: 'Scanners',
  batch: 'Batches',
};

/**
 * Separator between values in compound metadata filter columns.
 */
export const CSV_MULTI_VALUE_SEPARATOR = ', ';

// `all` is equivalent to having no filter for an attribute
type Multiplicity = 'single' | 'multi' | 'all';

/**
 * Describes the metadata structure of the CSV. We distinguish between single
 * multi attributes because "single" is the common and intuitive use case,
 * alongside which we want to add additional related metadata. The "multi"
 * attributes are only to ensure the CSV is self-documenting when there are
 * filters selecting for multiple values.
 */
export type CsvMetadataStructure = {
  [K in CsvMetadataAttribute]: Multiplicity;
};

/**
 * Given a filter and group by defining a report, determines the metadata structure of the report.
 */
export function determineCsvMetadataStructure({
  filter,
  groupBy,
}: {
  filter: Tabulation.Filter;
  groupBy: Tabulation.GroupBy;
}): CsvMetadataStructure {
  const filterStructure: CsvMetadataStructure = {
    precinct: filter.precinctIds
      ? filter.precinctIds.length > 1
        ? 'multi'
        : 'single'
      : 'all',
    ballotStyle: filter.ballotStyleIds
      ? filter.ballotStyleIds.length > 1
        ? 'multi'
        : 'single'
      : 'all',
    party: filter.partyIds
      ? filter.partyIds.length > 1
        ? 'multi'
        : 'single'
      : 'all',
    votingMethod: filter.votingMethods
      ? filter.votingMethods.length > 1
        ? 'multi'
        : 'single'
      : 'all',
    scanner: filter.scannerIds
      ? filter.scannerIds.length > 1
        ? 'multi'
        : 'single'
      : 'all',
    batch: filter.batchIds
      ? filter.batchIds.length > 1
        ? 'multi'
        : 'single'
      : 'all',
  };

  // If we're grouping by an attribute, it's always going to be a single.
  // Otherwise, the multiplicity is the same as the filter.
  return {
    ballotStyle: groupBy.groupByBallotStyle
      ? 'single'
      : filterStructure.ballotStyle,
    party: groupBy.groupByParty ? 'single' : filterStructure.party,
    precinct: groupBy.groupByPrecinct ? 'single' : filterStructure.precinct,
    scanner: groupBy.groupByScanner ? 'single' : filterStructure.scanner,
    batch: groupBy.groupByBatch ? 'single' : filterStructure.batch,
    votingMethod: groupBy.groupByVotingMethod
      ? 'single'
      : filterStructure.votingMethod,
  };
}
