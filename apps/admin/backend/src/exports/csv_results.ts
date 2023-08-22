// eslint-disable-next-line import/no-unresolved
import { stringify } from 'csv-stringify/sync';
import {
  writeInCandidate,
  Contest,
  Tabulation,
  electionHasPrimaryContest,
  ElectionDefinition,
  Id,
  AnyContest,
} from '@votingworks/types';
import { assert, assertDefined } from '@votingworks/basics';
import {
  convertGroupSpecifierToFilter,
  getBallotStyleById,
  getEmptyElectionResults,
  getPartyById,
  getPrecinctById,
  groupBySupportsZeroSplits,
  groupMapToGroupList,
  mergeFilters,
  populateSplits,
} from '@votingworks/utils';
import { Readable } from 'stream';
import { ScannerBatch } from '../types';
import { Store } from '../store';
import { tabulateElectionResults } from '../tabulation/full_results';

function generateHeaders({
  groupBy,
  isPrimaryElection,
}: {
  groupBy: Tabulation.GroupBy;
  isPrimaryElection: boolean;
}): string[] {
  const headers = [];

  if (groupBy.groupByVotingMethod) {
    headers.push('Voting Method');
  }

  if (groupBy.groupByPrecinct) {
    headers.push('Precinct');
    headers.push('Precinct ID');
  }

  if (
    isPrimaryElection &&
    (groupBy.groupByParty || groupBy.groupByBallotStyle)
  ) {
    headers.push('Party');
    headers.push('Party ID');
  }

  if (groupBy.groupByBallotStyle) {
    headers.push('Ballot Style ID');
  }

  if (groupBy.groupByScanner || groupBy.groupByBatch) {
    headers.push('Scanner ID');
  }

  if (groupBy.groupByBatch) {
    headers.push('Batch ID');
  }

  headers.push('Contest', 'Contest ID', 'Selection', 'Selection ID', 'Votes');

  return headers;
}

const VOTING_METHOD_LABEL: Record<Tabulation.VotingMethod, string> = {
  absentee: 'Absentee',
  precinct: 'Precinct',
  provisional: 'Provisional',
};

type BatchLookup = Record<string, ScannerBatch>;

function buildCsvRow({
  groupBy,
  groupSpecifier,
  electionDefinition,
  isPrimaryElection,
  batchLookup,
  contest,
  selection,
  selectionId,
  votes,
}: {
  groupBy: Tabulation.GroupBy;
  groupSpecifier: Tabulation.GroupSpecifier;
  electionDefinition: ElectionDefinition;
  isPrimaryElection: boolean;
  batchLookup: BatchLookup;
  contest: Contest;
  selection: string;
  selectionId: string;
  votes: number;
}): string {
  const values: string[] = [];

  if (groupBy.groupByVotingMethod) {
    assert(groupSpecifier.votingMethod !== undefined);
    values.push(VOTING_METHOD_LABEL[groupSpecifier.votingMethod]);
  }

  if (groupBy.groupByPrecinct) {
    assert(groupSpecifier.precinctId !== undefined);
    values.push(
      getPrecinctById(electionDefinition, groupSpecifier.precinctId).name
    );
    values.push(groupSpecifier.precinctId);
  }

  if (
    isPrimaryElection &&
    (groupBy.groupByParty || groupBy.groupByBallotStyle)
  ) {
    const partyId = (() => {
      if (groupBy.groupByParty) {
        return assertDefined(groupSpecifier.partyId);
      }

      return assertDefined(
        getBallotStyleById(
          electionDefinition,
          assertDefined(groupSpecifier.ballotStyleId)
        ).partyId
      );
    })();

    values.push(assertDefined(getPartyById(electionDefinition, partyId).name));
    values.push(partyId);
  }

  if (groupBy.groupByBallotStyle) {
    assert(groupSpecifier.ballotStyleId !== undefined);
    values.push(groupSpecifier.ballotStyleId);
  }

  if (groupBy.groupByScanner || groupBy.groupByBatch) {
    const scannerId = (() => {
      if (groupBy.groupByScanner) {
        return assertDefined(groupSpecifier.scannerId);
      }

      return assertDefined(batchLookup[assertDefined(groupSpecifier.batchId)])
        .scannerId;
    })();
    values.push(scannerId);
  }

  if (groupBy.groupByBatch) {
    values.push(assertDefined(groupSpecifier.batchId));
  }

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
  groupBy,
  resultSplits,
  store,
  overallReportFilter,
}: {
  electionId: Id;
  electionDefinition: ElectionDefinition;
  groupBy: Tabulation.GroupBy;
  resultSplits: Tabulation.ElectionResultsGroupList;
  store: Store;
  overallReportFilter: Tabulation.Filter;
}): Generator<string> {
  const { election } = electionDefinition;
  const isPrimaryElection = electionHasPrimaryContest(election);
  const writeInCandidates = store.getWriteInCandidates({ electionId });
  const batchLookup = generateBatchLookup(store, assertDefined(electionId));

  for (const resultsSplit of resultSplits) {
    const effectiveFilter = mergeFilters(
      overallReportFilter,
      convertGroupSpecifierToFilter(resultsSplit)
    );
    const contestIds = new Set(
      store.getFilteredContests({
        electionId,
        filter: effectiveFilter,
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
      const contestResults = resultsSplit.contestResults[contest.id];
      assert(contestResults !== undefined);

      if (contest.type === 'candidate') {
        assert(contestResults.contestType === 'candidate');

        // official candidate rows
        for (const candidate of contest.candidates) {
          /* c8 ignore next -- trivial fallthrough zero branch */
          const votes = contestResults.tallies[candidate.id]?.tally ?? 0;
          yield buildCsvRow({
            groupBy,
            groupSpecifier: resultsSplit,
            electionDefinition,
            isPrimaryElection,
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
              groupBy,
              groupSpecifier: resultsSplit,
              electionDefinition,
              isPrimaryElection,
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
              groupBy,
              groupSpecifier: resultsSplit,
              electionDefinition,
              isPrimaryElection,
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
          groupBy,
          groupSpecifier: resultsSplit,
          electionDefinition,
          isPrimaryElection,
          batchLookup,
          contest,
          selection: 'Yes',
          selectionId: contest.yesOption?.id || 'yes',
          votes: contestResults.yesTally,
        });
        yield buildCsvRow({
          groupBy,
          groupSpecifier: resultsSplit,
          electionDefinition,
          isPrimaryElection,
          batchLookup,
          contest,
          selection: 'No',
          selectionId: contest.noOption?.id || 'no',
          votes: contestResults.noTally,
        });
      }

      yield buildCsvRow({
        groupBy,
        groupSpecifier: resultsSplit,
        electionDefinition,
        isPrimaryElection,
        batchLookup,
        contest,
        selection: 'Overvotes',
        selectionId: 'overvotes',
        votes: contestResults.overvotes,
      });

      yield buildCsvRow({
        groupBy,
        groupSpecifier: resultsSplit,
        electionDefinition,
        isPrimaryElection,
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
 * results. Results are split according to the `groupBy` parameter. For each
 * additional split, one or more split metadata columns are added to each row.
 *  - `groupByBallotStyle` adds "Ballot Style ID" and, if a primary, "Party" and "Party ID"
 *  - `groupByParty` adds "Party" and "Party ID", if a primary
 *  - `groupByScanner` adds "Scanner ID"
 *  - `groupByBatch` adds "Batch ID" and "Scanner ID"
 *  - `groupByPrecinct` adds "Precinct" and "Precinct ID"
 *  - `groupByVotingMethod` adds "Voting Method"
 *
 * Notice that we are adding not only the metadata for the specified group but
 * metadata from inferable groups too. E.g., if we group by batch then we know
 * the scanner ID of each group.
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

  const isPrimaryElection = electionHasPrimaryContest(election);
  const headerRow = stringify([
    generateHeaders({ groupBy, isPrimaryElection }),
  ]);

  const nonEmptySplits = await tabulateElectionResults({
    electionId,
    store,
    filter,
    groupBy,
    includeManualResults: true,
    includeWriteInAdjudicationResults: true,
  });

  const resultSplits = (() => {
    if (!groupBySupportsZeroSplits(groupBy)) {
      return groupMapToGroupList(nonEmptySplits);
    }

    const expectedSplits = store.getTabulationGroups({
      electionId,
      groupBy,
      filter,
    });

    return populateSplits({
      expectedSplits,
      nonEmptySplits,
      groupBy,
      makeEmptySplit: () => getEmptyElectionResults(election),
    });
  })();

  function* generateResultsCsvRows() {
    yield headerRow;

    for (const dataRow of generateRows({
      resultSplits,
      groupBy,
      electionDefinition,
      electionId: assertDefined(electionId),
      store,
      overallReportFilter: filter,
    })) {
      yield dataRow;
    }
  }

  return Readable.from(generateResultsCsvRows());
}
