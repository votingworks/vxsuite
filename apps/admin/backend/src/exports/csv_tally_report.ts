import { stringify } from 'csv-stringify/sync';
import {
  Contest,
  Tabulation,
  ElectionDefinition,
  Id,
  AnyContest,
  Election,
} from '@votingworks/types';
import { Optional, assert, assertDefined } from '@votingworks/basics';
import {
  combineGroupSpecifierAndFilter,
  getEmptyElectionResults,
  getTallyReportCandidateRows,
  groupMapToGroupList,
  mergeTabulationGroupMaps,
} from '@votingworks/utils';
import { Store } from '../store';
import { tabulateElectionResults } from '../tabulation/full_results';
import {
  CsvMetadataStructure,
  determineCsvMetadataStructure,
  generateBatchLookup,
  generateCsvMetadataHeaders,
  getCsvMetadataRowValues,
} from './csv_shared';
import { tabulateManualResults } from '../tabulation/manual_results';
import { TallyCache } from '../tabulation/tally_cache';

// eslint-disable-next-line vx/gts-no-return-type-only-generics
function assertIsOptional<T>(_value?: unknown): asserts _value is Optional<T> {
  // noop
}

function generateHeaders({
  election,
  metadataStructure,
  hasManualResults,
}: {
  election: Election;
  metadataStructure: CsvMetadataStructure;
  hasManualResults: boolean;
}): string[] {
  const headers = generateCsvMetadataHeaders({ election, metadataStructure });
  headers.push('Contest', 'Contest ID', 'Selection', 'Selection ID');
  if (hasManualResults) {
    headers.push('Manual Votes', 'Scanned Votes');
  }
  headers.push('Total Votes');
  return headers;
}

function buildRow({
  metadataValues,
  contest,
  selection,
  selectionId,
  scannedVotes,
  hasManualResults,
  manualVotes,
}: {
  metadataValues: string[];
  contest: Contest;
  selection: string;
  selectionId: string;
  scannedVotes: number;
  hasManualResults: boolean;
  manualVotes: number;
}): string {
  const values: string[] = [...metadataValues];

  // Contest, Selection, and Tally
  // -----------------------------

  values.push(contest.title, contest.id, selection, selectionId);

  if (hasManualResults) {
    values.push(manualVotes.toString(), scannedVotes.toString());
  }
  values.push((manualVotes + scannedVotes).toString());

  return stringify([values]);
}

interface ScannedAndManualResults {
  scannedResults: Tabulation.ElectionResults;
  manualResults?: Tabulation.ManualElectionResults;
}

function* generateDataRows({
  electionId,
  electionDefinition,
  overallExportFilter,
  resultGroups,
  metadataStructure,
  store,
  hasManualResults,
}: {
  electionId: Id;
  electionDefinition: ElectionDefinition;
  overallExportFilter: Tabulation.Filter;
  resultGroups: Tabulation.GroupList<ScannedAndManualResults>;
  metadataStructure: CsvMetadataStructure;
  store: Store;
  hasManualResults: boolean;
}): Generator<string> {
  const { election } = electionDefinition;
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
    const { scannedResults, manualResults } = resultsGroup;

    for (const contest of includedContests) {
      const scannedContestResults = scannedResults.contestResults[contest.id];
      assert(scannedContestResults !== undefined);
      const manualContestResults = manualResults?.contestResults[contest.id];

      if (contest.type === 'candidate') {
        assert(scannedContestResults.contestType === 'candidate');
        assertIsOptional<Tabulation.CandidateContestResults>(
          manualContestResults
        );

        for (const {
          id,
          name,
          scannedTally,
          manualTally,
        } of getTallyReportCandidateRows({
          contest,
          scannedContestResults,
          manualContestResults,
          aggregateInsignificantWriteIns: false,
        })) {
          yield buildRow({
            metadataValues,
            contest,
            selection: name,
            selectionId: id,
            scannedVotes: scannedTally,
            hasManualResults,
            manualVotes: manualTally,
          });
        }
      } else if (contest.type === 'yesno') {
        assert(scannedContestResults.contestType === 'yesno');
        assertIsOptional<Tabulation.YesNoContestResults>(manualContestResults);
        yield buildRow({
          metadataValues,
          contest,
          selection: contest.yesOption.label,
          selectionId: contest.yesOption.id,
          scannedVotes: scannedContestResults.yesTally,
          hasManualResults,
          manualVotes: manualContestResults?.yesTally ?? 0,
        });
        yield buildRow({
          metadataValues,
          contest,
          selection: contest.noOption.label,
          selectionId: contest.noOption.id,
          scannedVotes: scannedContestResults.noTally,
          hasManualResults,
          manualVotes: manualContestResults?.noTally ?? 0,
        });
      }

      yield buildRow({
        metadataValues,
        contest,
        selection: 'Overvotes',
        selectionId: 'overvotes',
        scannedVotes: scannedContestResults.overvotes,
        hasManualResults,
        manualVotes: manualContestResults?.overvotes ?? 0,
      });

      yield buildRow({
        metadataValues,
        contest,
        selection: 'Undervotes',
        selectionId: 'undervotes',
        scannedVotes: scannedContestResults.undervotes,
        hasManualResults,
        manualVotes: manualContestResults?.undervotes ?? 0,
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
export async function* generateTallyReportCsv({
  store,
  filter = {},
  groupBy = {},
  tallyCache,
}: {
  store: Store;
  filter?: Tabulation.Filter;
  groupBy?: Tabulation.GroupBy;
  tallyCache?: TallyCache;
}): AsyncGenerator<string> {
  const electionId = store.getCurrentElectionId();
  assert(electionId !== undefined);
  const { electionDefinition } = assertDefined(store.getElection(electionId));
  const { election } = electionDefinition;

  const metadataStructure = determineCsvMetadataStructure({
    filter,
    groupBy,
  });

  // calculate scanned and manual results separately
  const allScannedResults = await tabulateElectionResults({
    electionId,
    store,
    filter,
    groupBy,
    includeManualResults: false,
    includeWriteInAdjudicationResults: true,
    tallyCache,
  });
  const manualTabulationResult = tabulateManualResults({
    electionId,
    store,
    filter,
    groupBy,
  });
  const allManualResults = manualTabulationResult.isOk()
    ? manualTabulationResult.ok()
    : {};
  const hasManualResults = Object.keys(allManualResults).length > 0;
  const resultGroups: Tabulation.GroupList<ScannedAndManualResults> =
    groupMapToGroupList(
      mergeTabulationGroupMaps(
        allScannedResults,
        allManualResults,
        (scannedResults, manualResults) => {
          return {
            scannedResults: scannedResults ?? getEmptyElectionResults(election),
            manualResults,
          };
        }
      )
    );

  yield stringify([
    generateHeaders({
      election,
      metadataStructure,
      hasManualResults,
    }),
  ]);
  yield* generateDataRows({
    electionDefinition,
    electionId: assertDefined(electionId),
    overallExportFilter: filter,
    resultGroups,
    metadataStructure,
    store,
    hasManualResults,
  });
}
