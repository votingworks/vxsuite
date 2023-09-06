// eslint-disable-next-line import/no-unresolved
import { stringify } from 'csv-stringify/sync';
import {
  writeInCandidate,
  Contest,
  Tabulation,
  ElectionDefinition,
  Id,
  AnyContest,
  Election,
} from '@votingworks/types';
import { assert, assertDefined } from '@votingworks/basics';
import {
  combineGroupSpecifierAndFilter,
  getBallotStyleById,
  getPartyById,
  getPrecinctById,
  groupMapToGroupList,
} from '@votingworks/utils';
import { Readable } from 'stream';
import { ScannerBatch } from '../types';
import { Store } from '../store';
import { tabulateElectionResults } from '../tabulation/full_results';

/**
 * Possible metadata attributes that can be included in the CSV, in the order
 * the columns will appear in the CSV.
 */
const METADATA_ATTRIBUTES = [
  'precinct',
  'party',
  'ballotStyle',
  'votingMethod',
  'scanner',
  'batch',
] as const;

type MetadataAttribute = typeof METADATA_ATTRIBUTES[number];

const METADATA_ATTRIBUTE_COMPOUND_LABEL: Record<MetadataAttribute, string> = {
  precinct: 'Precincts',
  party: 'Parties',
  ballotStyle: 'Ballot Styles',
  votingMethod: 'Voting Methods',
  scanner: 'Scanners',
  batch: 'Batches',
};

// `all` is equivalent to having no filter for an attribute
type Multiplicity = 'single' | 'multi' | 'all';

/**
 * Describes the metadata structure of the CSV. We distinguish between single
 * multi attributes because "single" is the common and intuitive use case,
 * alongside which we want to add additional related metadata. The "multi"
 * attributes are only to ensure the CSV is self-documenting when there are
 * filters selecting for multiple values.
 */
type MetadataStructure = {
  [K in MetadataAttribute]: Multiplicity;
};

function determineMetadataStructure({
  filter,
  groupBy,
}: {
  filter: Tabulation.Filter;
  groupBy: Tabulation.GroupBy;
}): MetadataStructure {
  const filterStructure: MetadataStructure = {
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

function generateHeaders({
  election,
  metadataStructure,
}: {
  election: Election;
  metadataStructure: MetadataStructure;
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
    headers.push('Batch ID');
  }

  // Compound Attributes
  // -----------------

  for (const attribute of METADATA_ATTRIBUTES) {
    if (metadataStructure[attribute] === 'multi') {
      headers.push(`Included ${METADATA_ATTRIBUTE_COMPOUND_LABEL[attribute]}`);
    }
  }

  // Contest, Selection, and Tally
  // -----------------------------

  headers.push('Contest', 'Contest ID', 'Selection', 'Selection ID', 'Votes');

  return headers;
}

function assertOnlyElement<T>(array?: T[]): T {
  assert(array);
  assert(array.length === 1);
  return assertDefined(array[0]);
}

type BatchLookup = Record<string, ScannerBatch>;

function buildCsvRow({
  filter,
  metadataStructure,
  electionDefinition,
  batchLookup,
  contest,
  selection,
  selectionId,
  votes,
}: {
  filter: Tabulation.Filter;
  metadataStructure: MetadataStructure;
  electionDefinition: ElectionDefinition;
  batchLookup: BatchLookup;
  contest: Contest;
  selection: string;
  selectionId: string;
  votes: number;
}): string {
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

      const ballotStyleId = assertOnlyElement(filter.ballotStyleIds);
      return assertDefined(
        getBallotStyleById(electionDefinition, ballotStyleId).partyId
      );
    })();

    values.push(getPartyById(electionDefinition, partyId).name);
    values.push(partyId);
  }

  if (metadataStructure.ballotStyle === 'single') {
    values.push(assertOnlyElement(filter.ballotStyleIds));
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

      return assertDefined(batchLookup[assertOnlyElement(filter.batchIds)])
        .scannerId;
    })();
    values.push(scannerId);
  }

  if (metadataStructure.batch === 'single') {
    values.push(assertOnlyElement(filter.batchIds));
  }

  // Multi Attributes
  // -------------------

  if (metadataStructure.precinct === 'multi') {
    values.push(
      assertDefined(filter.precinctIds)
        .map((id) => getPrecinctById(electionDefinition, id).name)
        .join(',')
    );
  }

  if (metadataStructure.party === 'multi') {
    values.push(
      assertDefined(filter.partyIds)
        .map((id) => getPartyById(electionDefinition, id).name)
        .join(',')
    );
  }

  if (metadataStructure.ballotStyle === 'multi') {
    values.push(assertDefined(filter.ballotStyleIds).join(','));
  }

  if (metadataStructure.votingMethod === 'multi') {
    values.push(
      assertDefined(filter.votingMethods)
        .map((method) => Tabulation.VOTING_METHOD_LABELS[method])
        .join(',')
    );
  }

  if (metadataStructure.scanner === 'multi') {
    values.push(assertDefined(filter.scannerIds).join(','));
  }

  if (metadataStructure.batch === 'multi') {
    values.push(assertDefined(filter.batchIds).join(','));
  }

  // Contest, Selection, and Tally
  // -----------------------------

  values.push(
    contest.title,
    contest.id,
    selection,
    selectionId,
    votes.toString()
  );

  return stringify([values]);
}

function generateBatchLookup(store: Store, electionId: Id): BatchLookup {
  const batches = store.getScannerBatches(electionId);
  const lookup: BatchLookup = {};
  for (const batch of batches) {
    lookup[batch.batchId] = batch;
  }
  return lookup;
}

function* generateRows({
  electionId,
  electionDefinition,
  overallExportFilter,
  resultGroups,
  metadataStructure,
  store,
}: {
  electionId: Id;
  electionDefinition: ElectionDefinition;
  overallExportFilter: Tabulation.Filter;
  resultGroups: Tabulation.ElectionResultsGroupList;
  metadataStructure: MetadataStructure;
  store: Store;
}): Generator<string> {
  const { election } = electionDefinition;
  const writeInCandidates = store.getWriteInCandidates({ electionId });
  const batchLookup = generateBatchLookup(store, assertDefined(electionId));

  for (const resultsGroup of resultGroups) {
    const groupFilter = combineGroupSpecifierAndFilter(
      resultsGroup,
      overallExportFilter
    );
    const contestIds = new Set(
      store.getFilteredContests({
        electionId,
        filter: groupFilter,
      })
    );
    const includedContests: AnyContest[] = [];
    for (const contest of election.contests) {
      if (contestIds.has(contest.id)) {
        includedContests.push(contest);
      }
    }

    for (const contest of includedContests) {
      const contestWriteInCandidates = writeInCandidates.filter(
        (c) => c.contestId === contest.id
      );
      const contestResults = resultsGroup.contestResults[contest.id];
      assert(contestResults !== undefined);

      if (contest.type === 'candidate') {
        assert(contestResults.contestType === 'candidate');

        // official candidate rows
        for (const candidate of contest.candidates) {
          /* c8 ignore next -- trivial fallthrough zero branch */
          const votes = contestResults.tallies[candidate.id]?.tally ?? 0;
          yield buildCsvRow({
            metadataStructure,
            filter: groupFilter,
            electionDefinition,
            batchLookup,
            contest,
            selection: candidate.name,
            selectionId: candidate.id,
            votes,
          });
        }

        // generic write-in row
        if (contest.allowWriteIns) {
          const votes = contestResults.tallies[writeInCandidate.id]?.tally ?? 0;
          if (votes) {
            yield buildCsvRow({
              metadataStructure,
              filter: groupFilter,
              electionDefinition,
              batchLookup,
              contest,
              selection: writeInCandidate.name,
              selectionId: writeInCandidate.id,
              votes,
            });
          }
        }

        // adjudicated write-in rows
        for (const contestWriteInCandidate of contestWriteInCandidates) {
          /* c8 ignore next 2 -- trivial fallthrough zero branch */
          const votes =
            contestResults.tallies[contestWriteInCandidate.id]?.tally ?? 0;

          if (votes) {
            yield buildCsvRow({
              metadataStructure,
              filter: groupFilter,
              electionDefinition,
              batchLookup,
              contest,
              selection: contestWriteInCandidate.name,
              selectionId: contestWriteInCandidate.id,
              votes,
            });
          }
        }
      } else if (contest.type === 'yesno') {
        assert(contestResults.contestType === 'yesno');
        yield buildCsvRow({
          metadataStructure,
          filter: groupFilter,
          electionDefinition,
          batchLookup,
          contest,
          selection: contest.yesOption.label,
          selectionId: contest.yesOption.id,
          votes: contestResults.yesTally,
        });
        yield buildCsvRow({
          metadataStructure,
          filter: groupFilter,
          electionDefinition,
          batchLookup,
          contest,
          selection: contest.noOption.label,
          selectionId: contest.noOption.id,
          votes: contestResults.noTally,
        });
      }

      yield buildCsvRow({
        metadataStructure,
        filter: groupFilter,
        electionDefinition,
        batchLookup,
        contest,
        selection: 'Overvotes',
        selectionId: 'overvotes',
        votes: contestResults.overvotes,
      });

      yield buildCsvRow({
        metadataStructure,
        filter: groupFilter,
        electionDefinition,
        batchLookup,
        contest,
        selection: 'Undervotes',
        selectionId: 'undervotes',
        votes: contestResults.undervotes,
      });
    }
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
export async function generateResultsCsv({
  store,
  filter = {},
  groupBy = {},
}: {
  store: Store;
  filter?: Tabulation.Filter;
  groupBy?: Tabulation.GroupBy;
}): Promise<NodeJS.ReadableStream> {
  const electionId = store.getCurrentElectionId();
  assert(electionId !== undefined);
  const { electionDefinition } = assertDefined(store.getElection(electionId));
  const { election } = electionDefinition;

  const metadataStructure = determineMetadataStructure({
    filter,
    groupBy,
  });

  const headerRow = stringify([
    generateHeaders({
      election,
      metadataStructure,
    }),
  ]);

  const resultGroups = groupMapToGroupList(
    await tabulateElectionResults({
      electionId,
      store,
      filter,
      groupBy,
      includeManualResults: true,
      includeWriteInAdjudicationResults: true,
    })
  );

  function* generateResultsCsvRows() {
    yield headerRow;

    for (const dataRow of generateRows({
      electionDefinition,
      electionId: assertDefined(electionId),
      overallExportFilter: filter,
      resultGroups,
      metadataStructure,
      store,
    })) {
      yield dataRow;
    }
  }

  return Readable.from(generateResultsCsvRows());
}
