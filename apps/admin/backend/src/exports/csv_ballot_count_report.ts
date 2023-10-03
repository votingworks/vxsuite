import { stringify } from 'csv-stringify/sync';
import {
  Tabulation,
  ElectionDefinition,
  Id,
  Election,
} from '@votingworks/types';
import { assert, assertDefined, throwIllegalValue } from '@votingworks/basics';
import {
  combineGroupSpecifierAndFilter,
  getBallotCount,
  getHmpbBallotCount,
  getScannedBallotCount,
  groupMapToGroupList,
} from '@votingworks/utils';
import { Readable } from 'stream';
import { Store } from '../store';
import {
  CsvMetadataStructure,
  determineCsvMetadataStructure,
  generateBatchLookup,
  generateCsvMetadataHeaders,
  getCsvMetadataRowValues,
} from './csv_shared';
import { tabulateFullCardCounts } from '../tabulation/card_counts';

function generateHeaders({
  election,
  metadataStructure,
  ballotCountBreakdown,
  hasManualTallies,
}: {
  election: Election;
  metadataStructure: CsvMetadataStructure;
  ballotCountBreakdown: Tabulation.BallotCountBreakdown;
  hasManualTallies: boolean;
}): string[] {
  const headers = generateCsvMetadataHeaders({ election, metadataStructure });

  switch (ballotCountBreakdown) {
    case 'none':
      headers.push('Total');
      break;
    case 'manual':
      headers.push('Manual', 'Scanned', 'Total');
      break;
    case 'all':
      if (hasManualTallies) {
        headers.push('Manual');
      }
      headers.push('BMD', 'HMPB', 'Total');
      break;
    /* c8 ignore next 2 -- compile-time check */
    default:
      throwIllegalValue(ballotCountBreakdown);
  }
  return headers;
}

function buildRow({
  metadataValues,
  cardCounts,
  ballotCountBreakdown,
  hasManualTallies,
}: {
  metadataValues: string[];
  cardCounts: Tabulation.CardCounts;
  ballotCountBreakdown: Tabulation.BallotCountBreakdown;
  hasManualTallies: boolean;
}): string {
  const values: string[] = [...metadataValues];

  const counts: number[] = [];
  /* c8 ignore next - trivial fallback case */
  const manual = cardCounts.manual ?? 0;
  const scanned = getScannedBallotCount(cardCounts);
  const { bmd } = cardCounts;
  const hmpb = getHmpbBallotCount(cardCounts);
  const total = getBallotCount(cardCounts);

  switch (ballotCountBreakdown) {
    case 'none':
      counts.push(total);
      break;
    case 'manual':
      counts.push(manual, scanned, total);
      break;
    case 'all':
      if (hasManualTallies) {
        counts.push(manual);
      }
      counts.push(bmd, hmpb, total);
      break;
    /* c8 ignore next 2 -- compile-time check */
    default:
      throwIllegalValue(ballotCountBreakdown);
  }

  return stringify([[...values, ...counts.map((num) => num.toString())]]);
}

function* generateDataRows({
  electionId,
  electionDefinition,
  overallExportFilter,
  allCardCounts,
  metadataStructure,
  ballotCountBreakdown,
  hasManualTallies,
  store,
}: {
  electionId: Id;
  electionDefinition: ElectionDefinition;
  overallExportFilter: Tabulation.Filter;
  allCardCounts: Tabulation.GroupList<Tabulation.CardCounts>;
  metadataStructure: CsvMetadataStructure;
  ballotCountBreakdown: Tabulation.BallotCountBreakdown;
  hasManualTallies: boolean;
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

    yield buildRow({
      metadataValues,
      cardCounts,
      ballotCountBreakdown,
      hasManualTallies,
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
export function generateBallotCountReportCsv({
  store,
  filter = {},
  groupBy = {},
  ballotCountBreakdown,
}: {
  store: Store;
  filter?: Tabulation.Filter;
  groupBy?: Tabulation.GroupBy;
  ballotCountBreakdown: Tabulation.BallotCountBreakdown;
}): NodeJS.ReadableStream {
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
      store,
      filter,
      groupBy,
    })
  );
  const hasManualTallies = // has any manual tallies for entire election, not just for this export
    store.getManualResultsMetadata({ electionId }).length > 0;

  const headerRow = stringify([
    generateHeaders({
      election,
      metadataStructure,
      ballotCountBreakdown,
      hasManualTallies,
    }),
  ]);

  function* generateAllRows() {
    yield headerRow;

    for (const dataRow of generateDataRows({
      electionDefinition,
      electionId: assertDefined(electionId),
      overallExportFilter: filter,
      allCardCounts,
      metadataStructure,
      ballotCountBreakdown,
      hasManualTallies,
      store,
    })) {
      yield dataRow;
    }
  }

  return Readable.from(generateAllRows());
}
