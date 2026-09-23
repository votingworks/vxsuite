import { stringify } from 'csv-stringify/sync';
import {
  Admin,
  Tabulation,
  ElectionDefinition,
  Id,
  Election,
} from '@votingworks/types';
import { assert, assertDefined } from '@votingworks/basics';
import {
  combineGroupSpecifierAndFilter,
  getBallotCount,
  getMaxSheetsPerBallot,
  getScannedBallotCount,
  getScannedBallotCountForSheet,
  groupMapToGroupList,
} from '@votingworks/utils';
import { Store } from '../store.js';
import {
  CsvMetadataStructure,
  determineCsvMetadataStructure,
  generateBatchLookup,
  generateCsvMetadataHeaders,
  generateCsvTitleRow,
  getCsvMetadataRowValues,
} from './csv_shared.js';
import { tabulateFullCardCounts } from '../tabulation/card_counts.js';

function generateHeaders({
  election,
  metadataStructure,
  includeReportingStatus,
  hasManualTallies,
  maxSheetsPerBallot,
}: {
  election: Election;
  metadataStructure: CsvMetadataStructure;
  includeReportingStatus: boolean;
  hasManualTallies: boolean;
  maxSheetsPerBallot?: number;
}): string[] {
  const headers = generateCsvMetadataHeaders({ election, metadataStructure });

  if (includeReportingStatus) {
    headers.push('Reporting Status');
  }

  if (hasManualTallies) {
    headers.push('Manual');
  }

  if (maxSheetsPerBallot) {
    headers.push('Scanned');
    for (let i = 2; i <= maxSheetsPerBallot; i += 1) {
      headers.push(`Scanned Sheet ${i}`);
    }
  } else if (hasManualTallies) {
    headers.push('Scanned');
  }

  headers.push('Total');

  return headers;
}

function buildRow({
  metadataValues,
  cardCounts,
  hasManualTallies,
  maxSheetsPerBallot,
}: {
  metadataValues: string[];
  cardCounts: Tabulation.CardCounts;
  hasManualTallies: boolean;
  maxSheetsPerBallot?: number;
}): string {
  const values: string[] = [...metadataValues];

  const counts: number[] = [];
  const manual = cardCounts.manual ?? 0;
  const total = getBallotCount(cardCounts);

  if (hasManualTallies) {
    counts.push(manual);
  }

  if (maxSheetsPerBallot) {
    for (let i = 0; i < maxSheetsPerBallot; i += 1) {
      counts.push(getScannedBallotCountForSheet(cardCounts, i));
    }
  } else if (hasManualTallies) {
    counts.push(getScannedBallotCount(cardCounts));
  }

  counts.push(total);

  return stringify([[...values, ...counts.map((num) => num.toString())]]);
}

function* generateDataRows({
  electionId,
  electionDefinition,
  overallExportFilter,
  allCardCounts,
  metadataStructure,
  includeReportingStatus,
  hasManualTallies,
  maxSheetsPerBallot,
  store,
}: {
  electionId: Id;
  electionDefinition: ElectionDefinition;
  overallExportFilter: Admin.ReportingFilter;
  allCardCounts: Tabulation.GroupList<Tabulation.CardCounts>;
  metadataStructure: CsvMetadataStructure;
  includeReportingStatus: boolean;
  hasManualTallies: boolean;
  maxSheetsPerBallot?: number;
  store: Store;
}): Generator<string> {
  const batchLookup = generateBatchLookup(store, assertDefined(electionId));

  for (const cardCounts of allCardCounts) {
    const groupFilter = combineGroupSpecifierAndFilter(
      cardCounts,
      overallExportFilter
    );
    const metadataValues = getCsvMetadataRowValues({
      filter: groupFilter,
      metadataStructure,
      electionDefinition,
      batchLookup,
    });
    const reportingStatusValues = includeReportingStatus
      ? [
          Admin.REPORTING_STATUS_LABELS[
            assertDefined(
              cardCounts.reportingStatus ?? overallExportFilter.reportingStatus
            )
          ],
        ]
      : [];

    yield buildRow({
      metadataValues: [...metadataValues, ...reportingStatusValues],
      cardCounts,
      hasManualTallies,
      maxSheetsPerBallot,
    });
  }
}

/**
 * Converts a tally for an election to a CSV file (represented as a string) of tally
 * results. Results are filtered by the `filter` parameter and grouped according to
 * the `groupBy` parameter. Each row is labelled with metadata according to its group
 * and the overall export's filter.
 *
 * Returns the file as a `NodeJS.ReadableStream` emitting line by line.
 */
export function* generateBallotCountReportCsv({
  store,
  filter = {},
  groupBy = {},
  includeSheetCounts,
  filename,
}: {
  store: Store;
  filter?: Admin.ReportingFilter;
  groupBy?: Tabulation.GroupBy;
  includeSheetCounts?: boolean;
  filename: string;
}): Iterable<string> {
  const electionId = store.getCurrentElectionId();
  assert(electionId !== undefined);
  const { electionDefinition } = assertDefined(store.getElection(electionId));
  const { election } = electionDefinition;

  const metadataStructure = determineCsvMetadataStructure({
    filter,
    groupBy,
  });
  const allCardCounts = groupMapToGroupList(
    tabulateFullCardCounts({
      electionId,
      election,
      store,
      filter,
      groupBy,
    })
  );
  const hasManualTallies = // has any manual tallies for entire election, not just for this export
    store.getManualResultsMetadata({ election, electionId }).length > 0;

  const maxSheetsPerBallot = includeSheetCounts
    ? getMaxSheetsPerBallot(election)
    : undefined;
  const includeReportingStatus = Boolean(
    groupBy.groupByReportingStatus || filter.reportingStatus
  );

  yield stringify([
    generateCsvTitleRow({ filename, electionDefinition }),
    generateHeaders({
      election,
      metadataStructure,
      includeReportingStatus,
      hasManualTallies,
      maxSheetsPerBallot,
    }),
  ]);
  yield* generateDataRows({
    electionDefinition,
    electionId: assertDefined(electionId),
    overallExportFilter: filter,
    allCardCounts,
    metadataStructure,
    includeReportingStatus,
    hasManualTallies,
    maxSheetsPerBallot,
    store,
  });
}
