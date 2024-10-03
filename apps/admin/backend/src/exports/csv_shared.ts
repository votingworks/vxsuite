import {
  Election,
  ElectionDefinition,
  Id,
  Tabulation,
} from '@votingworks/types';
import { assert, assertDefined } from '@votingworks/basics';
import {
  getBallotStyleById,
  getPartyById,
  getPrecinctById,
} from '@votingworks/utils';
import { ScannerBatchLookup } from '../types';
import { Store } from '../store';

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
    ballotStyle: filter.ballotStyleGroupIds
      ? filter.ballotStyleGroupIds.length > 1
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

/**
 * Based on the determined metadata structure of the export, generate the
 * metadata headers. Does not include the included data columns, e.g.
 * ballot counts or vote tallies.
 */
export function generateCsvMetadataHeaders({
  election,
  metadataStructure,
}: {
  election: Election;
  metadataStructure: CsvMetadataStructure;
}): string[] {
  const headers = [];

  // Simple Attributes
  // -----------------

  if (metadataStructure.precinct === 'single') {
    headers.push('Precinct');
    headers.push('Precinct ID');
  }

  if (
    election.type === 'primary' &&
    (metadataStructure.party === 'single' ||
      metadataStructure.ballotStyle === 'single')
  ) {
    headers.push('Party');
    headers.push('Party ID');
  }

  if (metadataStructure.ballotStyle === 'single') {
    headers.push('Ballot Style ID');
  }

  if (metadataStructure.votingMethod === 'single') {
    headers.push('Voting Method');
  }

  if (
    metadataStructure.scanner === 'single' ||
    metadataStructure.batch === 'single'
  ) {
    headers.push('Scanner ID');
  }

  if (metadataStructure.batch === 'single') {
    headers.push('Batch');
    headers.push('Batch ID');
  }

  // Compound Attributes
  // -----------------

  for (const attribute of CSV_METADATA_ATTRIBUTES) {
    if (metadataStructure[attribute] === 'multi') {
      headers.push(`Included ${CSV_METADATA_ATTRIBUTE_MULTI_LABEL[attribute]}`);
    }
  }

  return headers;
}

function assertOnlyElement<T>(array?: T[]): T {
  assert(array);
  assert(array.length === 1);
  return assertDefined(array[0]);
}

/**
 * Gets the metadata values for a single row of the CSV export.
 */
export function getCsvMetadataRowValues({
  filter,
  metadataStructure,
  electionDefinition,
  batchLookup,
}: {
  filter: Tabulation.Filter;
  metadataStructure: CsvMetadataStructure;
  electionDefinition: ElectionDefinition;
  batchLookup: ScannerBatchLookup;
}): string[] {
  const { election } = electionDefinition;
  const values: string[] = [];

  // Single Attributes
  // -----------------

  if (metadataStructure.precinct === 'single') {
    const precinctId = assertOnlyElement(filter.precinctIds);
    values.push(getPrecinctById(electionDefinition, precinctId).name);
    values.push(precinctId);
  }

  if (
    election.type === 'primary' &&
    (metadataStructure.party === 'single' ||
      metadataStructure.ballotStyle === 'single')
  ) {
    const partyId = (() => {
      if (metadataStructure.party === 'single') {
        return assertOnlyElement(filter.partyIds);
      }

      const ballotStyleId = assertOnlyElement(filter.ballotStyleGroupIds);
      return assertDefined(
        getBallotStyleById(electionDefinition, ballotStyleId).partyId
      );
    })();

    values.push(getPartyById(electionDefinition, partyId).name);
    values.push(partyId);
  }

  if (metadataStructure.ballotStyle === 'single') {
    values.push(assertOnlyElement(filter.ballotStyleGroupIds));
  }

  if (metadataStructure.votingMethod === 'single') {
    values.push(
      Tabulation.VOTING_METHOD_LABELS[assertOnlyElement(filter.votingMethods)]
    );
  }

  if (
    metadataStructure.scanner === 'single' ||
    metadataStructure.batch === 'single'
  ) {
    const scannerId = (() => {
      if (metadataStructure.scanner === 'single') {
        return assertOnlyElement(filter.scannerIds);
      }

      const batchId = assertOnlyElement(filter.batchIds);
      if (batchId === Tabulation.MANUAL_BATCH_ID) {
        return Tabulation.MANUAL_SCANNER_ID;
      }
      return assertDefined(batchLookup[batchId]).scannerId;
    })();
    values.push(scannerId);
  }

  if (metadataStructure.batch === 'single') {
    const batchId = assertOnlyElement(filter.batchIds);
    const batchLabel =
      batchId === Tabulation.MANUAL_BATCH_ID
        ? 'Manual Tallies'
        : assertDefined(batchLookup[batchId]).label;
    values.push(batchLabel);
    values.push(batchId);
  }

  // Multi Attributes
  // -------------------

  if (metadataStructure.precinct === 'multi') {
    values.push(
      assertDefined(filter.precinctIds)
        .map((id) => getPrecinctById(electionDefinition, id).name)
        .join(CSV_MULTI_VALUE_SEPARATOR)
    );
  }

  if (metadataStructure.party === 'multi') {
    values.push(
      assertDefined(filter.partyIds)
        .map((id) => getPartyById(electionDefinition, id).name)
        .join(CSV_MULTI_VALUE_SEPARATOR)
    );
  }

  if (metadataStructure.ballotStyle === 'multi') {
    values.push(
      assertDefined(filter.ballotStyleGroupIds).join(CSV_MULTI_VALUE_SEPARATOR)
    );
  }

  if (metadataStructure.votingMethod === 'multi') {
    values.push(
      assertDefined(filter.votingMethods)
        .map((method) => Tabulation.VOTING_METHOD_LABELS[method])
        .join(CSV_MULTI_VALUE_SEPARATOR)
    );
  }

  if (metadataStructure.scanner === 'multi') {
    values.push(
      assertDefined(filter.scannerIds).join(CSV_MULTI_VALUE_SEPARATOR)
    );
  }

  if (metadataStructure.batch === 'multi') {
    values.push(assertDefined(filter.batchIds).join(CSV_MULTI_VALUE_SEPARATOR));
  }

  return values;
}

/**
 * Create a dictionary of batch IDs to {@link ScannerBatch} objects for
 * efficient lookup.
 */
export function generateBatchLookup(
  store: Store,
  electionId: Id
): ScannerBatchLookup {
  const batches = store.getScannerBatches(electionId);
  const lookup: ScannerBatchLookup = {};
  for (const batch of batches) {
    lookup[batch.batchId] = batch;
  }
  return lookup;
}
