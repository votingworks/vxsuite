import {
  electionMinimalExhaustiveSampleDefinition,
  electionMinimalExhaustiveSampleFixtures,
} from '@votingworks/fixtures';
import { Tabulation, writeInCandidate } from '@votingworks/types';
import { getEmptyElectionResults } from '@votingworks/utils';
import {
  convertContestWriteInSummaryToWriteInTallies,
  getEmptyContestWriteInSummary,
  getEmptyElectionWriteInSummary,
  tabulateWriteInTallies,
  modifyElectionResultsWithWriteInSummary,
} from './write_ins';
import { ContestWriteInSummary, ElectionWriteInSummary } from '../types';
import {
  MockCastVoteRecordFile,
  addMockCvrFileToStore,
} from '../../test/mock_cvr_file';
import { Store } from '../store';

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

test('tabulateWriteInTallies', () => {
  const store = Store.memoryStore();
  const { electionDefinition } = electionMinimalExhaustiveSampleFixtures;
  const { election, electionData } = electionDefinition;
  const electionId = store.addElection(electionData);
  store.setCurrentElectionId(electionId);

  // add some mock cast vote records with write-ins to store
  const mockCastVoteRecordFile: MockCastVoteRecordFile = [
    {
      ballotStyleId: '1M',
      batchId: 'batch-1-1',
      scannerId: 'scanner-1',
      precinctId: 'precinct-1',
      votingMethod: 'precinct',
      votes: { 'zoo-council-mammal': ['write-in'] },
      card: { type: 'bmd' },
      multiplier: 5,
    },
    {
      ballotStyleId: '1M',
      batchId: 'batch-1-1',
      scannerId: 'scanner-1',
      precinctId: 'precinct-1',
      votingMethod: 'absentee',
      votes: { 'zoo-council-mammal': ['write-in'] },
      card: { type: 'bmd' },
      multiplier: 6,
    },
    {
      ballotStyleId: '2F',
      batchId: 'batch-1-2',
      scannerId: 'scanner-1',
      precinctId: 'precinct-1',
      votingMethod: 'precinct',
      votes: { 'zoo-council-mammal': ['write-in'] },
      card: { type: 'bmd' },
      multiplier: 17,
    },
    {
      ballotStyleId: '2F',
      batchId: 'batch-2-1',
      scannerId: 'scanner-2',
      precinctId: 'precinct-2',
      votingMethod: 'absentee',
      votes: { 'zoo-council-mammal': ['write-in'] },
      card: { type: 'bmd' },
      multiplier: 9,
    },
    {
      ballotStyleId: '2F',
      batchId: 'batch-2-2',
      scannerId: 'scanner-2',
      precinctId: 'precinct-2',
      votingMethod: 'precinct',
      votes: { 'zoo-council-mammal': ['write-in'] },
      card: { type: 'bmd' },
      multiplier: 12,
    },
    {
      ballotStyleId: '1M',
      batchId: 'batch-3-1',
      scannerId: 'scanner-3',
      precinctId: 'precinct-2',
      votingMethod: 'precinct',
      votes: { 'zoo-council-mammal': ['write-in'] },
      card: { type: 'bmd' },
      multiplier: 34,
    },
  ];
  addMockCvrFileToStore({ electionId, mockCastVoteRecordFile, store });

  // because we're only testing filtering
  function getMockElectionWriteInSummary(
    pendingTally: number
  ): ElectionWriteInSummary {
    const electionWriteInSummary = getEmptyElectionWriteInSummary(election);
    const contestWriteInSummary =
      getEmptyContestWriteInSummary('zoo-council-mammal');
    contestWriteInSummary.pendingTally = pendingTally;
    contestWriteInSummary.totalTally = pendingTally;
    electionWriteInSummary.contestWriteInSummaries['zoo-council-mammal'] =
      contestWriteInSummary;
    return electionWriteInSummary;
  }

  const testCases: Array<{
    filter?: Tabulation.Filter;
    groupBy?: Tabulation.GroupBy;
    expected: Array<
      [
        groupKey: Tabulation.GroupKey,
        tally: number,
        groupSpecifier: Tabulation.GroupSpecifier
      ]
    >;
  }> = [
    // no filter case
    {
      expected: [['root', 83, {}]],
    },
    // each filter case
    {
      filter: { precinctIds: ['precinct-2'] },
      expected: [['root', 55, {}]],
    },
    {
      filter: { scannerIds: ['scanner-2'] },
      expected: [['root', 21, {}]],
    },
    {
      filter: { batchIds: ['batch-2-1', 'batch-3-1'] },
      expected: [['root', 43, {}]],
    },
    {
      filter: { votingMethods: ['precinct'] },
      expected: [['root', 68, {}]],
    },
    {
      filter: { ballotStyleIds: ['1M'] },
      expected: [['root', 45, {}]],
    },
    {
      filter: { partyIds: ['0'] },
      expected: [['root', 45, {}]],
    },
    // empty filter case
    {
      filter: { partyIds: [] },
      expected: [['root', 0, {}]],
    },
    // trivial filter case
    {
      filter: { partyIds: ['0', '1'] },
      expected: [['root', 83, {}]],
    },
    // each group case
    {
      groupBy: { groupByBallotStyle: true },
      expected: [
        ['root&1M', 45, { ballotStyleId: '1M' }],
        ['root&2F', 38, { ballotStyleId: '2F' }],
      ],
    },
    {
      groupBy: { groupByParty: true },
      expected: [
        ['root&0', 45, { partyId: '0' }],
        ['root&1', 38, { partyId: '1' }],
      ],
    },
    {
      groupBy: { groupByBatch: true },
      expected: [
        ['root&batch-1-1', 11, { batchId: 'batch-1-1' }],
        ['root&batch-1-2', 17, { batchId: 'batch-1-2' }],
        ['root&batch-2-1', 9, { batchId: 'batch-2-1' }],
        ['root&batch-2-2', 12, { batchId: 'batch-2-2' }],
        ['root&batch-3-1', 34, { batchId: 'batch-3-1' }],
      ],
    },
    {
      groupBy: { groupByScanner: true },
      expected: [
        ['root&scanner-1', 28, { scannerId: 'scanner-1' }],
        ['root&scanner-2', 21, { scannerId: 'scanner-2' }],
        ['root&scanner-3', 34, { scannerId: 'scanner-3' }],
      ],
    },
    {
      groupBy: { groupByPrecinct: true },
      expected: [
        ['root&precinct-1', 28, { precinctId: 'precinct-1' }],
        ['root&precinct-2', 55, { precinctId: 'precinct-2' }],
      ],
    },
    {
      groupBy: { groupByVotingMethod: true },
      expected: [
        ['root&precinct', 68, { votingMethod: 'precinct' }],
        ['root&absentee', 15, { votingMethod: 'absentee' }],
      ],
    },
  ];

  for (const { filter, groupBy, expected } of testCases) {
    const groupedWriteInSummaries = tabulateWriteInTallies({
      electionId,
      store,
      filter,
      groupBy,
    });

    for (const [groupKey, tally, groupSpecifier] of expected) {
      expect(groupedWriteInSummaries[groupKey]).toEqual({
        ...getMockElectionWriteInSummary(tally),
        ...groupSpecifier,
      });
    }

    expect(Object.values(groupedWriteInSummaries)).toHaveLength(
      expected.length
    );
  }
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
