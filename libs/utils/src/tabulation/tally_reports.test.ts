import { electionTwoPartyPrimaryFixtures } from '@votingworks/fixtures';
import { find } from '@votingworks/basics';
import { CandidateContest, Tabulation } from '@votingworks/types';
import { buildContestResultsFixture } from './tabulation';
import {
  getTallyReportCandidateRows,
  shorthandTallyReportCandidateRow,
} from './tally_reports';

const { electionDefinition } = electionTwoPartyPrimaryFixtures;
const { election } = electionDefinition;

const contestId = 'zoo-council-mammal';
const contest = find(
  election.contests,
  (c) => c.id === contestId
) as CandidateContest;

test('getTallyReportRows', () => {
  const scannedContestResults = buildContestResultsFixture({
    contest,
    includeGenericWriteIn: false,
    contestResultsSummary: {
      type: 'candidate',
      ballots: 50,
      officialOptionTallies: {
        zebra: 40,
      },
      writeInOptionTallies: {
        'write-in-1': {
          name: 'Write-In 1',
          tally: 5,
        },
        'write-in-2': {
          name: 'Write-In 2',
          tally: 5,
        },
        [Tabulation.PENDING_WRITE_IN_ID]: {
          ...Tabulation.PENDING_WRITE_IN_CANDIDATE,
          tally: 1,
        },
      },
    },
  }) as Tabulation.CandidateContestResults;

  const manualContestResults = buildContestResultsFixture({
    contest,
    includeGenericWriteIn: false,
    contestResultsSummary: {
      type: 'candidate',
      ballots: 50,
      officialOptionTallies: {
        zebra: 20,
        lion: 20,
      },
      writeInOptionTallies: {
        'write-in-1': {
          name: 'Write-In 1',
          tally: 5,
        },
        'write-in-3': {
          name: 'Write-In 3',
          tally: 5,
        },
      },
    },
  }) as Tabulation.CandidateContestResults;

  expect(
    getTallyReportCandidateRows({ contest, scannedContestResults }).map(
      shorthandTallyReportCandidateRow
    )
  ).toEqual([
    ['zebra', 'Zebra', 40, 0],
    ['lion', 'Lion', 0, 0],
    ['kangaroo', 'Kangaroo', 0, 0],
    ['elephant', 'Elephant', 0, 0],
    ['write-in-1', 'Write-In 1 (Write-In)', 5, 0],
    ['write-in-2', 'Write-In 2 (Write-In)', 5, 0],
    ['write-in', 'Unadjudicated Write-In', 1, 0],
  ]);

  expect(
    getTallyReportCandidateRows({
      contest,
      scannedContestResults,
      manualContestResults,
    }).map(shorthandTallyReportCandidateRow)
  ).toEqual([
    ['zebra', 'Zebra', 40, 20],
    ['lion', 'Lion', 0, 20],
    ['kangaroo', 'Kangaroo', 0, 0],
    ['elephant', 'Elephant', 0, 0],
    ['write-in-1', 'Write-In 1 (Write-In)', 5, 5],
    ['write-in-2', 'Write-In 2 (Write-In)', 5, 0],
    ['write-in-3', 'Write-In 3 (Write-In)', 0, 5],
    ['write-in', 'Unadjudicated Write-In', 1, 0],
  ]);
});
