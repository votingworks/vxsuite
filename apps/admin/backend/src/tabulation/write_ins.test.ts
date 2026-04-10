import { expect, test } from 'vitest';
import { Buffer } from 'node:buffer';
import {
  electionFamousNames2021Fixtures,
  electionTwoPartyPrimaryFixtures,
  makeTemporaryDirectory,
  readElectionTwoPartyPrimary,
} from '@votingworks/fixtures';
import {
  BallotStyleGroupId,
  DEFAULT_SYSTEM_SETTINGS,
  Tabulation,
} from '@votingworks/types';
import { assertDefined } from '@votingworks/basics';
import { getEmptyElectionResults } from '@votingworks/utils';
import {
  convertContestWriteInSummaryToWriteInTallies,
  getEmptyContestWriteInSummary,
  getEmptyElectionWriteInSummary,
  tabulateWriteInTallies,
  modifyElectionResultsWithWriteInSummary,
  combineElectionWriteInSummaries,
} from './write_ins';
import {
  MockCastVoteRecordFile,
  addMockCvrFileToStore,
} from '../../test/mock_cvr_file';
import { Store } from '../store';

const electionTwoPartyPrimary = readElectionTwoPartyPrimary();

test('getEmptyElectionWriteInSummary', () => {
  const election = electionTwoPartyPrimary;

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
      ballotStyleGroupId: '1M' as BallotStyleGroupId,
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
        ballotStyleGroupId: '1M' as BallotStyleGroupId,
        contestId: 'zoo-council-mammal',
        status: 'pending',
        tally: 11,
      },
      {
        ballotStyleGroupId: '1M' as BallotStyleGroupId,
        contestId: 'zoo-council-mammal',
        status: 'adjudicated',
        adjudicationType: 'invalid',
        tally: 9,
      },
      {
        ballotStyleGroupId: '1M' as BallotStyleGroupId,
        contestId: 'zoo-council-mammal',
        status: 'adjudicated',
        adjudicationType: 'official-candidate',
        candidateId: 'lion',
        candidateName: 'Lion',
        tally: 7,
      },
      {
        ballotStyleGroupId: '1M' as BallotStyleGroupId,
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

const mockZooCouncilMammalSummary: Tabulation.ContestWriteInSummary = {
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

const mockAquariumCouncilFishSummary: Tabulation.ContestWriteInSummary = {
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
  const store = Store.memoryStore(makeTemporaryDirectory());
  const electionDefinition =
    electionTwoPartyPrimaryFixtures.readElectionDefinition();
  const { election, electionData } = electionDefinition;
  const electionId = store.addElection({
    electionData,
    systemSettingsData: JSON.stringify(DEFAULT_SYSTEM_SETTINGS),
    electionPackageFileContents: Buffer.of(),
    electionPackageHash: 'test-election-package-hash',
  });
  store.setCurrentElectionId(electionId);

  // add some mock cast vote records with write-ins to store
  const mockCastVoteRecordFile: MockCastVoteRecordFile = [
    {
      ballotStyleGroupId: '1M' as BallotStyleGroupId,
      batchId: 'batch-1-1',
      scannerId: 'scanner-1',
      precinctId: 'precinct-1',
      votingMethod: 'precinct',
      votes: { 'zoo-council-mammal': ['write-in'] },
      card: { type: 'bmd' },
      multiplier: 5,
    },
    {
      ballotStyleGroupId: '1M' as BallotStyleGroupId,
      batchId: 'batch-1-1',
      scannerId: 'scanner-1',
      precinctId: 'precinct-1',
      votingMethod: 'absentee',
      votes: { 'zoo-council-mammal': ['write-in'] },
      card: { type: 'bmd' },
      multiplier: 6,
    },
    {
      ballotStyleGroupId: '2F' as BallotStyleGroupId,
      batchId: 'batch-1-2',
      scannerId: 'scanner-1',
      precinctId: 'precinct-1',
      votingMethod: 'precinct',
      votes: { 'zoo-council-mammal': ['write-in'] },
      card: { type: 'bmd' },
      multiplier: 17,
    },
    {
      ballotStyleGroupId: '2F' as BallotStyleGroupId,
      batchId: 'batch-2-1',
      scannerId: 'scanner-2',
      precinctId: 'precinct-2',
      votingMethod: 'absentee',
      votes: { 'zoo-council-mammal': ['write-in'] },
      card: { type: 'bmd' },
      multiplier: 9,
    },
    {
      ballotStyleGroupId: '2F' as BallotStyleGroupId,
      batchId: 'batch-2-2',
      scannerId: 'scanner-2',
      precinctId: 'precinct-2',
      votingMethod: 'precinct',
      votes: { 'zoo-council-mammal': ['write-in'] },
      card: { type: 'bmd' },
      multiplier: 12,
    },
    {
      ballotStyleGroupId: '1M' as BallotStyleGroupId,
      batchId: 'batch-3-1',
      scannerId: 'scanner-3',
      precinctId: 'precinct-2',
      votingMethod: 'precinct',
      votes: { 'zoo-council-mammal': ['write-in'] },
      card: { type: 'bmd' },
      multiplier: 34,
    },
    // Write-in with overvote
    {
      ballotStyleGroupId: '1M' as BallotStyleGroupId,
      batchId: 'batch-3-1',
      scannerId: 'scanner-3',
      precinctId: 'precinct-2',
      votingMethod: 'precinct',
      votes: {
        'zoo-council-mammal': ['write-in', 'elephant', 'lion', 'zebra'],
      },
      card: { type: 'bmd' },
      multiplier: 1,
    },
  ];
  addMockCvrFileToStore({ electionId, mockCastVoteRecordFile, store });

  // because we're only testing filtering
  function getMockElectionWriteInSummary(
    pendingTally: number,
    invalidTally: number
  ): Tabulation.ElectionWriteInSummary {
    const electionWriteInSummary = getEmptyElectionWriteInSummary(election);
    const contestWriteInSummary =
      getEmptyContestWriteInSummary('zoo-council-mammal');
    contestWriteInSummary.pendingTally = pendingTally;
    contestWriteInSummary.invalidTally = invalidTally;
    contestWriteInSummary.totalTally = pendingTally + invalidTally;
    electionWriteInSummary.contestWriteInSummaries['zoo-council-mammal'] =
      contestWriteInSummary;
    return electionWriteInSummary;
  }

  const testCases: Array<{
    filter?: Tabulation.Filter;
    groupBy?: Tabulation.GroupBy;
    expected: Array<
      [groupKey: Tabulation.GroupKey, tally: number, invalidTally: number]
    >;
  }> = [
    // no filter case
    {
      expected: [['root', 83, 1]],
    },
    // each filter case
    {
      filter: { precinctIds: ['precinct-2'] },
      expected: [['root', 55, 1]],
    },
    {
      filter: { scannerIds: ['scanner-2'] },
      expected: [['root', 21, 0]],
    },
    {
      filter: { batchIds: ['batch-2-1', 'batch-3-1'] },
      expected: [['root', 43, 1]],
    },
    {
      filter: { votingMethods: ['precinct'] },
      expected: [['root', 68, 1]],
    },
    {
      filter: { ballotStyleGroupIds: ['1M'] as BallotStyleGroupId[] },
      expected: [['root', 45, 1]],
    },
    {
      filter: { partyIds: ['0'] },
      expected: [['root', 45, 1]],
    },
    // empty filter case
    {
      filter: { partyIds: [] },
      expected: [['root', 0, 0]],
    },
    // trivial filter case
    {
      filter: { partyIds: ['0', '1'] },
      expected: [['root', 83, 1]],
    },
    // each group case
    {
      groupBy: { groupByBallotStyle: true },
      expected: [
        ['root&ballotStyleGroupId=1M', 45, 1],
        ['root&ballotStyleGroupId=2F', 38, 0],
      ],
    },
    {
      groupBy: { groupByParty: true },
      expected: [
        ['root&partyId=0', 45, 1],
        ['root&partyId=1', 38, 0],
      ],
    },
    {
      groupBy: { groupByBatch: true },
      expected: [
        ['root&batchId=batch-1-1', 11, 0],
        ['root&batchId=batch-1-2', 17, 0],
        ['root&batchId=batch-2-1', 9, 0],
        ['root&batchId=batch-2-2', 12, 0],
        ['root&batchId=batch-3-1', 34, 1],
      ],
    },
    {
      groupBy: { groupByScanner: true },
      expected: [
        ['root&scannerId=scanner-1', 28, 0],
        ['root&scannerId=scanner-2', 21, 0],
        ['root&scannerId=scanner-3', 34, 1],
      ],
    },
    {
      groupBy: { groupByPrecinct: true },
      expected: [
        ['root&precinctId=precinct-1', 28, 0],
        ['root&precinctId=precinct-2', 55, 1],
      ],
    },
    {
      groupBy: { groupByVotingMethod: true },
      expected: [
        ['root&votingMethod=precinct', 68, 1],
        ['root&votingMethod=absentee', 15, 0],
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

    for (const [groupKey, tally, invalidTally] of expected) {
      expect(groupedWriteInSummaries[groupKey]).toEqual(
        getMockElectionWriteInSummary(tally, invalidTally)
      );
    }

    expect(Object.values(groupedWriteInSummaries)).toHaveLength(
      expected.length
    );
  }

  // Re-test with includeUnallocablePendingWriteInsAsPending = true.
  // Here the tally from the overvote write-in should be counted as pending
  // instead of invalid.
  for (const { filter, groupBy, expected } of testCases) {
    const groupedWriteInSummaries = tabulateWriteInTallies({
      electionId,
      store,
      filter,
      groupBy,
      includeUnallocablePendingWriteInsAsPending: true,
    });

    for (const [groupKey, tally, invalidTally] of expected) {
      expect(groupedWriteInSummaries[groupKey]).toEqual(
        getMockElectionWriteInSummary(tally + invalidTally, 0)
      );
    }

    expect(Object.values(groupedWriteInSummaries)).toHaveLength(
      expected.length
    );
  }
});

test('modifyElectionResultsWithWriteInSummary', () => {
  const election = electionTwoPartyPrimary;
  const electionResults = getEmptyElectionResults(election);

  electionResults.cardCounts.bmd = [112];
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
      [Tabulation.GENERIC_WRITE_IN_ID]: {
        ...Tabulation.GENERIC_WRITE_IN_CANDIDATE,
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
        name: 'Unadjudicated Write-In',
        tally: 11,
      },
    },
    undervotes: 6,
    votesAllowed: 3,
  });
});

test('modifyElectionResultsWithWriteInSummary in qualified mode - before adjudication', () => {
  const election = electionTwoPartyPrimary;
  const electionResults = getEmptyElectionResults(election);

  electionResults.cardCounts.bmd = [112];
  electionResults.contestResults['zoo-council-mammal'] = {
    contestId: 'zoo-council-mammal',
    ballots: 112,
    overvotes: 0,
    undervotes: 0,
    contestType: 'candidate',
    votesAllowed: 3,
    tallies: {
      lion: {
        id: 'lion',
        name: 'Lion',
        tally: 56,
      },
      [Tabulation.GENERIC_WRITE_IN_ID]: {
        ...Tabulation.GENERIC_WRITE_IN_CANDIDATE,
        tally: 56,
      },
    },
  };

  // Before adjudication: all write-ins pending
  const writeInSummary: Tabulation.ElectionWriteInSummary = {
    contestWriteInSummaries: {
      'zoo-council-mammal': {
        contestId: 'zoo-council-mammal',
        totalTally: 56,
        pendingTally: 56,
        invalidTally: 0,
        candidateTallies: {},
      },
    },
  };

  const qualifiedCandidates = [
    {
      id: 'chimera',
      electionId: 'test',
      contestId: 'zoo-council-mammal',
      name: 'Chimera',
    },
    {
      id: 'unicorn',
      electionId: 'test',
      contestId: 'zoo-council-mammal',
      name: 'Unicorn',
    },
  ];

  const modifiedResults = modifyElectionResultsWithWriteInSummary(
    electionResults,
    writeInSummary,
    qualifiedCandidates
  );

  const contestResults = assertDefined(
    modifiedResults.contestResults['zoo-council-mammal']
  ) as Tabulation.CandidateContestResults;

  // Qualified candidates appear with 0 tally
  expect(contestResults.tallies['chimera']).toEqual({
    id: 'chimera',
    name: 'Chimera',
    tally: 0,
    isWriteIn: true,
  });
  expect(contestResults.tallies['unicorn']).toEqual({
    id: 'unicorn',
    name: 'Unicorn',
    tally: 0,
    isWriteIn: true,
  });

  // Pending write-ins still show as unadjudicated
  expect(contestResults.tallies[Tabulation.PENDING_WRITE_IN_ID]).toEqual({
    ...Tabulation.PENDING_WRITE_IN_CANDIDATE,
    tally: 56,
  });
});

test('modifyElectionResultsWithWriteInSummary in qualified mode - after adjudication', () => {
  const election = electionTwoPartyPrimary;
  const electionResults = getEmptyElectionResults(election);

  electionResults.cardCounts.bmd = [112];
  electionResults.contestResults['zoo-council-mammal'] = {
    contestId: 'zoo-council-mammal',
    ballots: 112,
    overvotes: 0,
    undervotes: 0,
    contestType: 'candidate',
    votesAllowed: 3,
    tallies: {
      lion: {
        id: 'lion',
        name: 'Lion',
        tally: 56,
      },
      [Tabulation.GENERIC_WRITE_IN_ID]: {
        ...Tabulation.GENERIC_WRITE_IN_CANDIDATE,
        tally: 56,
      },
    },
  };

  // After adjudication: some votes for chimera, none for unicorn, no pending
  const writeInSummary: Tabulation.ElectionWriteInSummary = {
    contestWriteInSummaries: {
      'zoo-council-mammal': {
        contestId: 'zoo-council-mammal',
        totalTally: 56,
        pendingTally: 0,
        invalidTally: 46,
        candidateTallies: {
          chimera: {
            id: 'chimera',
            name: 'Chimera',
            isWriteIn: true,
            tally: 10,
          },
        },
      },
    },
  };

  const qualifiedCandidates = [
    {
      id: 'chimera',
      electionId: 'test',
      contestId: 'zoo-council-mammal',
      name: 'Chimera',
    },
    {
      id: 'unicorn',
      electionId: 'test',
      contestId: 'zoo-council-mammal',
      name: 'Unicorn',
    },
  ];

  const modifiedResults = modifyElectionResultsWithWriteInSummary(
    electionResults,
    writeInSummary,
    qualifiedCandidates
  );

  const contestResults = assertDefined(
    modifiedResults.contestResults['zoo-council-mammal']
  ) as Tabulation.CandidateContestResults;

  // Chimera has adjudicated votes
  expect(contestResults.tallies['chimera']).toEqual({
    id: 'chimera',
    name: 'Chimera',
    tally: 10,
    isWriteIn: true,
  });

  // Unicorn appears with 0 tally
  expect(contestResults.tallies['unicorn']).toEqual({
    id: 'unicorn',
    name: 'Unicorn',
    tally: 0,
    isWriteIn: true,
  });

  // No generic "write-ins" bucket — no pending write-ins
  expect(
    contestResults.tallies[Tabulation.PENDING_WRITE_IN_ID]
  ).toBeUndefined();

  // No generic write-in bucket either
  expect(
    contestResults.tallies[Tabulation.GENERIC_WRITE_IN_ID]
  ).toBeUndefined();
});

test('combineElectionWriteInSummaries', () => {
  const election = electionFamousNames2021Fixtures.readElection();
  expect(
    combineElectionWriteInSummaries(
      {
        contestWriteInSummaries: {
          mayor: {
            contestId: 'mayor',
            totalTally: 50,
            pendingTally: 7,
            invalidTally: 9,
            candidateTallies: {
              'sherlock-holmes': {
                id: 'sherlock-holmes',
                name: 'Sherlock Holmes',
                tally: 5,
              },
              'thomas-edison': {
                id: 'thomas-edison',
                name: 'Thomas Edison',
                tally: 8,
              },
              'a-write-in': {
                id: 'a-write-in',
                name: 'A Write-In',
                tally: 21,
              },
            },
          },
          'chief-of-police': {
            contestId: 'chief-of-police',
            totalTally: 50,
            pendingTally: 50,
            invalidTally: 0,
            candidateTallies: {},
          },
        },
      },
      {
        contestWriteInSummaries: {
          mayor: {
            contestId: 'mayor',
            totalTally: 70,
            pendingTally: 13,
            invalidTally: 17,
            candidateTallies: {
              'sherlock-holmes': {
                id: 'sherlock-holmes',
                name: 'Sherlock Holmes',
                tally: 1,
              },
              'thomas-edison': {
                id: 'thomas-edison',
                name: 'Thomas Edison',
                tally: 2,
              },
              'b-write-in': {
                id: 'b-write-in',
                name: 'B Write-In',
                tally: 37,
              },
            },
          },
          controller: {
            contestId: 'controller',
            totalTally: 50,
            pendingTally: 50,
            invalidTally: 0,
            candidateTallies: {},
          },
        },
      },
      election
    )
  ).toEqual({
    contestWriteInSummaries: {
      'chief-of-police': {
        candidateTallies: {},
        contestId: 'chief-of-police',
        invalidTally: 0,
        pendingTally: 50,
        totalTally: 50,
      },
      controller: {
        candidateTallies: {},
        contestId: 'controller',
        invalidTally: 0,
        pendingTally: 50,
        totalTally: 50,
      },
      mayor: {
        candidateTallies: {
          'a-write-in': {
            id: 'a-write-in',
            name: 'A Write-In',
            tally: 21,
          },
          'b-write-in': {
            id: 'b-write-in',
            name: 'B Write-In',
            tally: 37,
          },
          'sherlock-holmes': {
            id: 'sherlock-holmes',
            name: 'Sherlock Holmes',
            tally: 6,
          },
          'thomas-edison': {
            id: 'thomas-edison',
            name: 'Thomas Edison',
            tally: 10,
          },
        },
        contestId: 'mayor',
        invalidTally: 26,
        pendingTally: 20,
        totalTally: 120,
      },
    },
  });
});
