// eslint-disable-next-line import/no-unresolved
import { stringify } from 'csv-stringify/sync';
import {
  Election,
  writeInCandidate,
  Precinct,
  Contest,
  Tabulation,
} from '@votingworks/types';
import { assert, throwIllegalValue } from '@votingworks/basics';
import {
  getEmptyElectionResults,
  groupMapToGroupList,
} from '@votingworks/utils';
import { Readable } from 'stream';
import { WriteInCandidateRecord } from '../types';

function buildCsvRow(
  precinct: Precinct,
  votingMethod: string,
  votes: number | undefined,
  contest: Contest,
  selection: string,
  selectionId?: string
): string {
  return stringify([
    [
      `${contest.title}`,
      contest.id,
      `${selection}`,
      selectionId ?? '',
      `${precinct.name}`,
      precinct.id,
      votingMethod,
      votes?.toString() ?? '0',
    ],
  ]);
}

function getVotingMethodLabel(votingMethod: Tabulation.VotingMethod): string {
  switch (votingMethod) {
    case 'absentee':
      return 'Absentee';
    case 'precinct':
      return 'Precinct';
    /* c8 ignore next 4 */
    case 'provisional':
      return 'Provisional';
    default:
      throwIllegalValue(votingMethod);
  }
}

const INCLUDED_VOTING_METHODS: Tabulation.VotingMethod[] = [
  'absentee',
  'precinct',
];

function* generateRows({
  electionResultsByPrecinctAndVotingMethod,
  election,
  writeInCandidates,
}: {
  electionResultsByPrecinctAndVotingMethod: Tabulation.ElectionResultsGroupMap;
  election: Election;
  writeInCandidates: WriteInCandidateRecord[];
}): Generator<string> {
  const electionResultsList = groupMapToGroupList(
    electionResultsByPrecinctAndVotingMethod
  );
  for (const precinct of election.precincts) {
    for (const votingMethod of INCLUDED_VOTING_METHODS) {
      const electionResults =
        electionResultsList.find(
          (er) =>
            er.precinctId === precinct.id && er.votingMethod === votingMethod
        ) || getEmptyElectionResults(election);

      for (const contest of election.contests) {
        const contestWriteInCandidates = writeInCandidates.filter(
          (c) => c.contestId === contest.id
        );
        const contestResults = electionResults.contestResults[contest.id];
        assert(contestResults !== undefined);

        if (contest.type === 'candidate') {
          assert(contestResults.contestType === 'candidate');

          // official candidate rows
          for (const candidate of contest.candidates) {
            yield buildCsvRow(
              precinct,
              getVotingMethodLabel(votingMethod),
              contestResults.tallies[candidate.id]?.tally,
              contest,
              candidate.name,
              candidate.id
            );
          }

          // generic write-in row
          if (contest.allowWriteIns) {
            const tally = contestResults.tallies[writeInCandidate.id]?.tally;
            if (tally) {
              yield buildCsvRow(
                precinct,
                getVotingMethodLabel(votingMethod),
                tally,
                contest,
                writeInCandidate.name,
                writeInCandidate.id
              );
            }
          }

          // adjudicated write-in rows
          for (const contestWriteInCandidate of contestWriteInCandidates) {
            const tally =
              contestResults.tallies[contestWriteInCandidate.id]?.tally;
            if (tally) {
              yield buildCsvRow(
                precinct,
                getVotingMethodLabel(votingMethod),
                tally,
                contest,
                contestWriteInCandidate.name,
                contestWriteInCandidate.id
              );
            }
          }
        } else if (contest.type === 'yesno') {
          assert(contestResults.contestType === 'yesno');
          yield buildCsvRow(
            precinct,
            getVotingMethodLabel(votingMethod),
            contestResults.yesTally,
            contest,
            'Yes',
            contest.yesOption?.id
          );
          yield buildCsvRow(
            precinct,
            getVotingMethodLabel(votingMethod),
            contestResults.noTally,
            contest,
            'No',
            contest.noOption?.id
          );
        }

        yield buildCsvRow(
          precinct,
          getVotingMethodLabel(votingMethod),
          contestResults.overvotes,
          contest,
          'Overvotes'
        );

        yield buildCsvRow(
          precinct,
          getVotingMethodLabel(votingMethod),
          contestResults.undervotes,
          contest,
          'Undervotes'
        );
      }
    }
  }
}

/**
 * Converts a tally for an election to a CSV file (represented as a string) of tally results
 * broken down by voting method and precinct.
 */
export function generateResultsCsv({
  electionResultsByPrecinctAndVotingMethod,
  election,
  writeInCandidates,
}: {
  electionResultsByPrecinctAndVotingMethod: Tabulation.ElectionResultsGroupMap;
  election: Election;
  writeInCandidates: WriteInCandidateRecord[];
}): NodeJS.ReadableStream {
  // TODO(https://github.com/votingworks/vxsuite/issues/2631): Omit the voting method column for
  // elections where we can't distinguish between absentee/precinct ballots (e.g. NH). Punted as
  // out-of-scope for the NH pilot.
  const headers = [
    'Contest',
    'Contest ID',
    'Selection',
    'Selection ID',
    'Precinct',
    'Precinct ID',
    'Voting Method',
    'Votes',
  ];

  const headerRow = stringify([headers]);

  function* generateResultsCsvRows() {
    yield headerRow;

    for (const dataRow of generateRows({
      electionResultsByPrecinctAndVotingMethod,
      election,
      writeInCandidates,
    })) {
      yield dataRow;
    }
  }

  return Readable.from(generateResultsCsvRows());
}
