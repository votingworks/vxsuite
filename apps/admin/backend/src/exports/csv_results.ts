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
  groupMapToGroupList,
} from '@votingworks/utils';
import { Readable } from 'stream';
import { Store } from '../store';
import { tabulateElectionResults } from '../tabulation/full_results';
import {
  CsvMetadataStructure,
  determineCsvMetadataStructure,
  generateBatchLookup,
  generateCsvMetadataHeaders,
  getCsvMetadataRowValues,
} from './csv_shared';

function generateHeaders({
  election,
  metadataStructure,
}: {
  election: Election;
  metadataStructure: CsvMetadataStructure;
}): string[] {
  const headers = generateCsvMetadataHeaders({ election, metadataStructure });
  headers.push('Contest', 'Contest ID', 'Selection', 'Selection ID', 'Votes');
  return headers;
}

function buildCsvRow({
  metadataValues,
  contest,
  selection,
  selectionId,
  votes,
}: {
  metadataValues: string[];
  contest: Contest;
  selection: string;
  selectionId: string;
  votes: number;
}): string {
  const values: string[] = [...metadataValues];

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
  metadataStructure: CsvMetadataStructure;
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
    const metadataValues = getCsvMetadataRowValues({
      filter: groupFilter,
      metadataStructure,
      electionDefinition,
      batchLookup,
    });
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
            metadataValues,
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
              metadataValues,
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
              metadataValues,
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
          metadataValues,
          contest,
          selection: contest.yesOption.label,
          selectionId: contest.yesOption.id,
          votes: contestResults.yesTally,
        });
        yield buildCsvRow({
          metadataValues,
          contest,
          selection: contest.noOption.label,
          selectionId: contest.noOption.id,
          votes: contestResults.noTally,
        });
      }

      yield buildCsvRow({
        metadataValues,
        contest,
        selection: 'Overvotes',
        selectionId: 'overvotes',
        votes: contestResults.overvotes,
      });

      yield buildCsvRow({
        metadataValues,
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

  const metadataStructure = determineCsvMetadataStructure({
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
