import { describe, expect, test } from 'vitest';
import { electionTwoPartyPrimaryFixtures } from '@votingworks/fixtures';
import { find } from '@votingworks/basics';
import { CandidateContest, DistrictId, Tabulation } from '@votingworks/types';
import { buildContestResultsFixture } from './tabulation';
import {
  getTallyReportCandidateRows,
  shorthandTallyReportCandidateRow,
} from './tally_reports';

const electionDefinition =
  electionTwoPartyPrimaryFixtures.readElectionDefinition();
const { election } = electionDefinition;

const contestId = 'zoo-council-mammal';
const contest = find(
  election.contests,
  (c) => c.id === contestId
) as CandidateContest;

test('getTallyReportRows - no aggregation', () => {
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
    getTallyReportCandidateRows({
      contest,
      scannedContestResults,
      aggregateInsignificantWriteIns: false,
    }).map(shorthandTallyReportCandidateRow)
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
      aggregateInsignificantWriteIns: false,
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

describe('getTallyReportRows - aggregating insignificant write-ins', () => {
  const preAdjudicationScannedContestResults: Tabulation.CandidateContestResults =
    buildContestResultsFixture({
      contest,
      contestResultsSummary: {
        type: 'candidate',
        ballots: 100,
        officialOptionTallies: {
          zebra: 50,
          lion: 15,
          kangaroo: 10,
          elephant: 5,
        },
        writeInOptionTallies: {
          [Tabulation.PENDING_WRITE_IN_ID]: {
            ...Tabulation.PENDING_WRITE_IN_CANDIDATE,
            tally: 30,
          },
        },
      },
    }) as Tabulation.CandidateContestResults;

  const midAdjudicationScannedContestResults: Tabulation.CandidateContestResults =
    buildContestResultsFixture({
      contest,
      contestResultsSummary: {
        type: 'candidate',
        ballots: 100,
        officialOptionTallies: {
          zebra: 50,
          lion: 15,
          kangaroo: 10,
          elephant: 5,
        },
        writeInOptionTallies: {
          'write-in-1': {
            name: 'Write-In 1',
            tally: 15,
          },
          'write-in-2': {
            name: 'Write-In 2',
            tally: 3,
          },
          'write-in-3': {
            name: 'Write-In 3',
            tally: 2,
          },
          [Tabulation.PENDING_WRITE_IN_ID]: {
            ...Tabulation.PENDING_WRITE_IN_CANDIDATE,
            tally: 10,
          },
        },
      },
    }) as Tabulation.CandidateContestResults;

  const postAdjudicationScannedContestResults: Tabulation.CandidateContestResults =
    buildContestResultsFixture({
      contest,
      contestResultsSummary: {
        type: 'candidate',
        ballots: 100,
        officialOptionTallies: {
          zebra: 50,
          lion: 15,
          kangaroo: 10,
          elephant: 5,
        },
        writeInOptionTallies: {
          'write-in-1': {
            name: 'Write-In 1',
            tally: 25,
          },
          'write-in-2': {
            name: 'Write-In 2',
            tally: 3,
          },
          'write-in-3': {
            name: 'Write-In 3',
            tally: 2,
          },
        },
      },
      includeGenericWriteIn: false,
    }) as Tabulation.CandidateContestResults;

  const manualContestResults: Tabulation.CandidateContestResults =
    buildContestResultsFixture({
      contest,
      contestResultsSummary: {
        type: 'candidate',
        ballots: 50,
        officialOptionTallies: {
          zebra: 10,
          lion: 5,
          kangaroo: 5,
          elephant: 0,
        },
        writeInOptionTallies: {
          'write-in-4': {
            name: 'Write-In 4',
            tally: 30,
          },
        },
      },
      includeGenericWriteIn: false,
    }) as Tabulation.CandidateContestResults;

  test('with manual results', () => {
    expect(
      getTallyReportCandidateRows({
        contest,
        scannedContestResults: preAdjudicationScannedContestResults,
        manualContestResults,
        aggregateInsignificantWriteIns: true,
      }).map(shorthandTallyReportCandidateRow)
    ).toEqual([
      ['zebra', 'Zebra', 50, 10],
      ['lion', 'Lion', 15, 5],
      ['kangaroo', 'Kangaroo', 10, 5],
      ['elephant', 'Elephant', 5, 0],
      ['write-in-4', 'Write-In 4 (Write-In)', 0, 30],
      ['write-in', 'Unadjudicated Write-In', 30, 0],
    ]);

    expect(
      getTallyReportCandidateRows({
        contest,
        scannedContestResults: midAdjudicationScannedContestResults,
        manualContestResults,
        aggregateInsignificantWriteIns: true,
      }).map(shorthandTallyReportCandidateRow)
    ).toEqual([
      ['zebra', 'Zebra', 50, 10],
      ['lion', 'Lion', 15, 5],
      ['kangaroo', 'Kangaroo', 10, 5],
      ['elephant', 'Elephant', 5, 0],
      ['write-in-4', 'Write-In 4 (Write-In)', 0, 30],
      ['write-in-1', 'Write-In 1 (Write-In)', 15, 0],
      ['write-in-other', 'Other Write-In', 5, 0],
      ['write-in', 'Unadjudicated Write-In', 10, 0],
    ]);

    expect(
      getTallyReportCandidateRows({
        contest,
        scannedContestResults: postAdjudicationScannedContestResults,
        manualContestResults,
        aggregateInsignificantWriteIns: true,
      }).map(shorthandTallyReportCandidateRow)
    ).toEqual([
      ['zebra', 'Zebra', 50, 10],
      ['lion', 'Lion', 15, 5],
      ['kangaroo', 'Kangaroo', 10, 5],
      ['elephant', 'Elephant', 5, 0],
      ['write-in-4', 'Write-In 4 (Write-In)', 0, 30],
      ['write-in-1', 'Write-In 1 (Write-In)', 25, 0],
      ['write-in-other', 'Other Write-In', 5, 0],
    ]);
  });

  test('without manual results', () => {
    expect(
      getTallyReportCandidateRows({
        contest,
        scannedContestResults: postAdjudicationScannedContestResults,
        aggregateInsignificantWriteIns: true,
      }).map(shorthandTallyReportCandidateRow)
    ).toEqual([
      ['zebra', 'Zebra', 50, 0],
      ['lion', 'Lion', 15, 0],
      ['kangaroo', 'Kangaroo', 10, 0],
      ['elephant', 'Elephant', 5, 0],
      ['write-in-1', 'Write-In 1 (Write-In)', 25, 0],
      ['write-in-other', 'Other Write-In', 5, 0],
    ]);
  });

  test('when no significant write-ins, buckets all write-ins', () => {
    expect(
      getTallyReportCandidateRows({
        contest,
        scannedContestResults: buildContestResultsFixture({
          contest,
          contestResultsSummary: {
            type: 'candidate',
            ballots: 100,
            officialOptionTallies: {
              zebra: 50,
              lion: 25,
              kangaroo: 15,
              elephant: 5,
            },
            writeInOptionTallies: {
              'write-in-1': {
                name: 'Write-In 1',
                tally: 5,
              },
            },
          },
        }) as Tabulation.CandidateContestResults,
        aggregateInsignificantWriteIns: true,
      }).map(shorthandTallyReportCandidateRow)
    ).toEqual([
      ['zebra', 'Zebra', 50, 0],
      ['lion', 'Lion', 25, 0],
      ['kangaroo', 'Kangaroo', 15, 0],
      ['elephant', 'Elephant', 5, 0],
      ['write-in-other', 'Write-In', 5, 0],
    ]);
  });

  test('when contest has more seats than candidates, shows all write-in candidates', () => {
    const mockContest: CandidateContest = {
      type: 'candidate',
      seats: 3,
      allowWriteIns: true,
      districtId: 'id' as DistrictId,
      title: 'Title',
      id: 'id',
      candidates: [
        {
          id: 'official',
          name: 'Official',
        },
      ],
    };

    expect(
      getTallyReportCandidateRows({
        contest: mockContest,
        scannedContestResults: buildContestResultsFixture({
          contest: mockContest,
          contestResultsSummary: {
            type: 'candidate',
            ballots: 100,
            officialOptionTallies: {
              official: 70,
            },
            writeInOptionTallies: {
              'write-in-1': {
                name: 'Write-In 1',
                tally: 30,
              },
            },
          },
        }) as Tabulation.CandidateContestResults,
        aggregateInsignificantWriteIns: true,
      }).map(shorthandTallyReportCandidateRow)
    ).toEqual([
      ['official', 'Official', 70, 0],
      ['write-in-1', 'Write-In 1 (Write-In)', 30, 0],
    ]);
  });

  test('when there is no write-in data at all, a placeholder row is included for write-in contests', () => {
    expect(
      getTallyReportCandidateRows({
        contest,
        scannedContestResults: buildContestResultsFixture({
          contest,
          contestResultsSummary: {
            type: 'candidate',
            ballots: 100,
            officialOptionTallies: {
              zebra: 70,
              lion: 15,
              kangaroo: 10,
              elephant: 5,
            },
          },
        }) as Tabulation.CandidateContestResults,
        aggregateInsignificantWriteIns: true,
      }).map(shorthandTallyReportCandidateRow)
    ).toEqual([
      ['zebra', 'Zebra', 70, 0],
      ['lion', 'Lion', 15, 0],
      ['kangaroo', 'Kangaroo', 10, 0],
      ['elephant', 'Elephant', 5, 0],
      ['write-in', 'Write-In', 0, 0],
    ]);
  });
});
