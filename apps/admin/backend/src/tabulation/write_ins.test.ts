import { electionMinimalExhaustiveSampleDefinition } from '@votingworks/fixtures';
import { Tabulation, writeInCandidate } from '@votingworks/types';
import { GROUP_KEY_ROOT, getEmptyElectionResults } from '@votingworks/utils';
import {
  convertContestWriteInSummaryToWriteInTallies,
  getEmptyContestWriteInSummary,
  getEmptyElectionWriteInSummary,
  tabulateWriteInTallies,
  modifyElectionResultsWithWriteInSummary,
} from './write_ins';
import { ContestWriteInSummary, WriteInTally } from '../types';

test('getEmptyElectionWriteInSummary', () => {
  const { election } = electionMinimalExhaustiveSampleDefinition;

  expect(getEmptyElectionWriteInSummary(election)).toEqual({
    contestWriteInSummaries: {
      'aquarium-council-fish': {
        contestId: 'aquarium-council-fish',
        invalidTally: 0,
        pendingTally: 0,
        totalTally: 0,
        candidateTallies: {},
      },
      'zoo-council-mammal': {
        contestId: 'zoo-council-mammal',
        invalidTally: 0,
        pendingTally: 0,
        totalTally: 0,
        candidateTallies: {},
      },
    },
  });
});

test('convertContestWriteInSummaryToWriteInTallies', () => {
  expect(
    convertContestWriteInSummaryToWriteInTallies({
      ballotStyleId: '1M',
      contestId: 'zoo-council-mammal',
      invalidTally: 9,
      pendingTally: 11,
      totalTally: 32,
      candidateTallies: {
        'mr-pickles': {
          id: 'mr-pickles',
          name: 'Mr. Pickles',
          tally: 5,
          isWriteIn: true,
        },
        lion: {
          id: 'lion',
          name: 'Lion',
          tally: 7,
          isWriteIn: false,
        },
      },
    })
  ).toMatchObject(
    expect.arrayContaining([
      {
        ballotStyleId: '1M',
        contestId: 'zoo-council-mammal',
        status: 'pending',
        tally: 11,
      },
      {
        ballotStyleId: '1M',
        contestId: 'zoo-council-mammal',
        status: 'adjudicated',
        adjudicationType: 'invalid',
        tally: 9,
      },
      {
        ballotStyleId: '1M',
        contestId: 'zoo-council-mammal',
        status: 'adjudicated',
        adjudicationType: 'official-candidate',
        candidateId: 'lion',
        candidateName: 'Lion',
        tally: 7,
      },
      {
        ballotStyleId: '1M',
        contestId: 'zoo-council-mammal',
        status: 'adjudicated',
        adjudicationType: 'write-in-candidate',
        candidateId: 'mr-pickles',
        candidateName: 'Mr. Pickles',
        tally: 5,
      },
    ])
  );
});

const mockZooCouncilMammalSummary: ContestWriteInSummary = {
  totalTally: 32,
  contestId: 'zoo-council-mammal',
  pendingTally: 11,
  invalidTally: 9,
  candidateTallies: {
    lion: {
      id: 'lion',
      name: 'Lion',
      isWriteIn: false,
      tally: 5,
    },
    chimera: {
      id: 'chimera',
      name: 'Chimera',
      isWriteIn: true,
      tally: 7,
    },
  },
};

const mockAquariumCouncilFishSummary: ContestWriteInSummary = {
  totalTally: 28,
  contestId: 'aquarium-council-fish',
  pendingTally: 4,
  invalidTally: 6,
  candidateTallies: {
    rockfish: {
      id: 'rockfish',
      name: 'Rockfish',
      isWriteIn: false,
      tally: 8,
    },
    relicanth: {
      id: 'relicanth',
      name: 'Relicanth',
      isWriteIn: true,
      tally: 10,
    },
  },
};

describe('tabulateWriteInTallies', () => {
  const { election } = electionMinimalExhaustiveSampleDefinition;

  test('without grouping', () => {
    expect(
      tabulateWriteInTallies({
        election,
        writeInTallies: [
          {
            contestId: 'zoo-council-mammal',
            status: 'pending',
            tally: 11,
          },
          {
            contestId: 'zoo-council-mammal',
            status: 'adjudicated',
            adjudicationType: 'invalid',
            tally: 9,
          },
          {
            contestId: 'zoo-council-mammal',
            status: 'adjudicated',
            adjudicationType: 'official-candidate',
            candidateId: 'lion',
            candidateName: 'Lion',
            tally: 7,
          },
          {
            contestId: 'zoo-council-mammal',
            status: 'adjudicated',
            adjudicationType: 'write-in-candidate',
            candidateId: 'mr-pickles',
            candidateName: 'Mr. Pickles',
            tally: 5,
          },
          {
            contestId: 'aquarium-council-fish',
            status: 'pending',
            tally: 25,
          },
        ],
      })[GROUP_KEY_ROOT]
    ).toEqual({
      contestWriteInSummaries: {
        'aquarium-council-fish': {
          contestId: 'aquarium-council-fish',
          invalidTally: 0,
          pendingTally: 25,
          totalTally: 25,
          candidateTallies: {},
        },
        'zoo-council-mammal': {
          contestId: 'zoo-council-mammal',
          invalidTally: 9,
          pendingTally: 11,
          totalTally: 32,
          candidateTallies: {
            'mr-pickles': {
              id: 'mr-pickles',
              name: 'Mr. Pickles',
              tally: 5,
              isWriteIn: true,
            },
            lion: {
              id: 'lion',
              name: 'Lion',
              tally: 7,
              isWriteIn: false,
            },
          },
        },
      },
    });
  });

  test('by ballot style', () => {
    const writeInTallies: Array<Tabulation.GroupOf<WriteInTally>> = [
      ...convertContestWriteInSummaryToWriteInTallies({
        ballotStyleId: '1M',
        ...mockZooCouncilMammalSummary,
      }),
      ...convertContestWriteInSummaryToWriteInTallies({
        ballotStyleId: '2F',
        ...mockAquariumCouncilFishSummary,
      }),
    ];

    const groupedWriteInSummaries = tabulateWriteInTallies({
      election,
      writeInTallies,
      groupBy: {
        groupByBallotStyle: true,
      },
    });
    expect(Object.entries(groupedWriteInSummaries)).toHaveLength(2);

    expect(groupedWriteInSummaries['root&1M']).toEqual({
      ballotStyleId: '1M',
      contestWriteInSummaries: {
        'zoo-council-mammal': mockZooCouncilMammalSummary,
        'aquarium-council-fish': getEmptyContestWriteInSummary(
          'aquarium-council-fish'
        ),
      },
    });

    expect(groupedWriteInSummaries['root&2F']).toEqual({
      ballotStyleId: '2F',
      contestWriteInSummaries: {
        'zoo-council-mammal':
          getEmptyContestWriteInSummary('zoo-council-mammal'),
        'aquarium-council-fish': mockAquariumCouncilFishSummary,
      },
    });
  });

  test('by party', () => {
    const writeInTallies: Array<Tabulation.GroupOf<WriteInTally>> = [
      ...convertContestWriteInSummaryToWriteInTallies({
        partyId: '0',
        ...mockZooCouncilMammalSummary,
      }),
      ...convertContestWriteInSummaryToWriteInTallies({
        partyId: '1',
        ...mockAquariumCouncilFishSummary,
      }),
    ];

    const groupedWriteInSummaries = tabulateWriteInTallies({
      election,
      writeInTallies,
      groupBy: {
        groupByParty: true,
      },
    });
    expect(Object.entries(groupedWriteInSummaries)).toHaveLength(2);

    expect(groupedWriteInSummaries['root&0']).toEqual({
      partyId: '0',
      contestWriteInSummaries: {
        'zoo-council-mammal': mockZooCouncilMammalSummary,
        'aquarium-council-fish': getEmptyContestWriteInSummary(
          'aquarium-council-fish'
        ),
      },
    });

    expect(groupedWriteInSummaries['root&1']).toEqual({
      partyId: '1',
      contestWriteInSummaries: {
        'zoo-council-mammal':
          getEmptyContestWriteInSummary('zoo-council-mammal'),
        'aquarium-council-fish': mockAquariumCouncilFishSummary,
      },
    });
  });

  test('by batch and scanner', () => {
    const writeInTallies: Array<Tabulation.GroupOf<WriteInTally>> = [
      ...convertContestWriteInSummaryToWriteInTallies({
        batchId: 'batch-1',
        scannerId: 'scanner-1',
        ...mockZooCouncilMammalSummary,
      }),
      ...convertContestWriteInSummaryToWriteInTallies({
        batchId: 'batch-1',
        scannerId: 'scanner-1',
        ...mockAquariumCouncilFishSummary,
      }),
    ];

    const groupedWriteInSummaries = tabulateWriteInTallies({
      election,
      writeInTallies,
      groupBy: {
        groupByBatch: true,
        groupByScanner: true,
      },
    });
    expect(Object.entries(groupedWriteInSummaries)).toHaveLength(1);

    expect(groupedWriteInSummaries['root&batch-1&scanner-1']).toEqual({
      batchId: 'batch-1',
      scannerId: 'scanner-1',
      contestWriteInSummaries: {
        'zoo-council-mammal': mockZooCouncilMammalSummary,
        'aquarium-council-fish': mockAquariumCouncilFishSummary,
      },
    });
  });

  test('by precinct and and voting method', () => {
    const writeInTallies: Array<Tabulation.GroupOf<WriteInTally>> = [
      ...convertContestWriteInSummaryToWriteInTallies({
        precinctId: 'precinct-1',
        votingMethod: 'precinct',
        ...mockZooCouncilMammalSummary,
      }),
      ...convertContestWriteInSummaryToWriteInTallies({
        precinctId: 'precinct-2',
        votingMethod: 'precinct',
        ...mockZooCouncilMammalSummary,
      }),
      ...convertContestWriteInSummaryToWriteInTallies({
        precinctId: 'precinct-1',
        votingMethod: 'absentee',
        ...mockZooCouncilMammalSummary,
      }),
      ...convertContestWriteInSummaryToWriteInTallies({
        precinctId: 'precinct-2',
        votingMethod: 'absentee',
        ...mockZooCouncilMammalSummary,
      }),
    ];

    const groupedWriteInSummaries = tabulateWriteInTallies({
      election,
      writeInTallies,
      groupBy: {
        groupByPrecinct: true,
        groupByVotingMethod: true,
      },
    });

    const electionWriteInSummaries = Object.values(groupedWriteInSummaries);
    expect(electionWriteInSummaries).toHaveLength(4);
    for (const electionWriteInSummary of electionWriteInSummaries) {
      expect(electionWriteInSummary.contestWriteInSummaries).toEqual({
        'zoo-council-mammal': mockZooCouncilMammalSummary,
        'aquarium-council-fish': getEmptyContestWriteInSummary(
          'aquarium-council-fish'
        ),
      });
    }
    expect(electionWriteInSummaries).toMatchObject(
      expect.arrayContaining([
        expect.objectContaining({
          precinctId: 'precinct-1',
          votingMethod: 'precinct',
        }),
        expect.objectContaining({
          precinctId: 'precinct-2',
          votingMethod: 'precinct',
        }),
        expect.objectContaining({
          precinctId: 'precinct-1',
          votingMethod: 'absentee',
        }),
        expect.objectContaining({
          precinctId: 'precinct-2',
          votingMethod: 'absentee',
        }),
      ])
    );
  });
});

test('modifyElectionResultsWithWriteInSummary', () => {
  const { election } = electionMinimalExhaustiveSampleDefinition;
  const electionResults = getEmptyElectionResults(election);

  electionResults.cardCounts.bmd = 112;
  electionResults.contestResults['zoo-council-mammal'] = {
    contestId: 'zoo-council-mammal',
    ballots: 112,
    overvotes: 6,
    undervotes: 6,
    contestType: 'candidate',
    votesAllowed: 3,
    tallies: {
      lion: {
        id: 'lion',
        name: 'Lion',
        tally: 56,
      },
      [writeInCandidate.id]: {
        ...writeInCandidate,
        tally: 56,
      },
    },
  };

  const modifiedElectionResults = modifyElectionResultsWithWriteInSummary(
    electionResults,
    {
      contestWriteInSummaries: {
        'zoo-council-mammal': mockZooCouncilMammalSummary,
        'aquarium-council-fish': mockAquariumCouncilFishSummary,
      },
    }
  );

  expect(modifiedElectionResults.contestResults['zoo-council-mammal']).toEqual({
    ballots: 112,
    contestId: 'zoo-council-mammal',
    contestType: 'candidate',
    overvotes: 6,
    tallies: {
      chimera: {
        id: 'chimera',
        isWriteIn: true,
        name: 'Chimera',
        tally: 7,
      },
      lion: {
        id: 'lion',
        name: 'Lion',
        tally: 61,
      },
      'write-in': {
        id: 'write-in',
        isWriteIn: true,
        name: 'Write-In',
        tally: 11,
      },
    },
    undervotes: 15,
    votesAllowed: 3,
  });
});
