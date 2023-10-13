import { stringify } from 'csv-stringify/sync';
import {
  Tabulation,
  ElectionDefinition,
  Id,
  Election,
} from '@votingworks/types';
import { assert, assertDefined } from '@votingworks/basics';
import {
  combineGroupSpecifierAndFilter,
  getBallotCount,
  getHmpbBallotCount,
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
  hasManualTallies,
}: {
  election: Election;
  metadataStructure: CsvMetadataStructure;
  hasManualTallies: boolean;
}): string[] {
  const headers = generateCsvMetadataHeaders({ election, metadataStructure });

  if (hasManualTallies) {
    headers.push('Manual');
  }
  headers.push('BMD', 'HMPB', 'Total');

  return headers;
}

function buildRow({
  metadataValues,
  cardCounts,
  hasManualTallies,
}: {
  metadataValues: string[];
  cardCounts: Tabulation.CardCounts;
  hasManualTallies: boolean;
}): string {
  const values: string[] = [...metadataValues];

  const counts: number[] = [];
  /* c8 ignore next - trivial fallback case */
  const manual = cardCounts.manual ?? 0;
  const { bmd } = cardCounts;
  const hmpb = getHmpbBallotCount(cardCounts);
  const total = getBallotCount(cardCounts);

  if (hasManualTallies) {
    counts.push(manual);
  }
  counts.push(bmd, hmpb, total);

  return stringify([[...values, ...counts.map((num) => num.toString())]]);
}

function* generateDataRows({
  electionId,
  electionDefinition,
  overallExportFilter,
  allCardCounts,
  metadataStructure,
  hasManualTallies,
  store,
}: {
  electionId: Id;
  electionDefinition: ElectionDefinition;
  overallExportFilter: Tabulation.Filter;
  allCardCounts: Tabulation.GroupList<Tabulation.CardCounts>;
  metadataStructure: CsvMetadataStructure;
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
}: {
  store: Store;
  filter?: Tabulation.Filter;
  groupBy?: Tabulation.GroupBy;
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
      hasManualTallies,
      store,
    })) {
      yield dataRow;
    }
  }

  return Readable.from(generateAllRows());
}
