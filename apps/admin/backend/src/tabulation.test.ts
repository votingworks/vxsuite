import {
  electionGridLayoutNewHampshireAmherstFixtures,
  electionMinimalExhaustiveSampleDefinition,
} from '@votingworks/fixtures';
import { Tabulation, writeInCandidate } from '@votingworks/types';
import {
  BooleanEnvironmentVariableName,
  GROUP_KEY_ROOT,
  getEmptyElectionResults,
  getFeatureFlagMock,
} from '@votingworks/utils';
import { assert } from '@votingworks/basics';
import { buildMockArtifactAuthenticator } from '@votingworks/auth';
import {
  convertContestWriteInSummaryToWriteInTallies,
  getEmptyContestWriteInSummary,
  getEmptyElectionWriteInSummary,
  tabulateElectionResults,
  tabulateWriteInTallies,
  modifyElectionResultsWithWriteInSummary,
} from './tabulation';
import { ContestWriteInSummary, WriteInTally } from './types';
import { Store } from './store';
import { addCastVoteRecordReport } from './cvr_files';

// mock SKIP_CVR_ELECTION_HASH_CHECK to allow us to use old cvr fixtures
const featureFlagMock = getFeatureFlagMock();
jest.mock('@votingworks/utils', () => {
  return {
    ...jest.requireActual('@votingworks/utils'),
    isFeatureFlagEnabled: (flag: BooleanEnvironmentVariableName) =>
      featureFlagMock.isEnabled(flag),
  };
});

beforeEach(() => {
  jest.restoreAllMocks();
  featureFlagMock.enableFeatureFlag(
    BooleanEnvironmentVariableName.SKIP_CVR_ELECTION_HASH_CHECK
  );
});

afterEach(() => {
  featureFlagMock.resetFeatureFlags();
});

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

describe('tabulateElectionResults', () => {
  test('with no grouping', async () => {
    const store = Store.memoryStore();

    const { electionDefinition, castVoteRecordReport } =
      electionGridLayoutNewHampshireAmherstFixtures;
    const electionId = store.addElection(electionDefinition.electionData);
    store.setCurrentElectionId(electionId);

    const addReportResult = await addCastVoteRecordReport({
      store,
      reportDirectoryPath: castVoteRecordReport.asDirectoryPath(),
      exportedTimestamp: new Date().toISOString(),
      artifactAuthenticator: buildMockArtifactAuthenticator(),
    });
    const { id: fileId } = addReportResult.unsafeUnwrap();
    expect(store.getCastVoteRecordCountByFileId(fileId)).toEqual(184);

    const initialResultsWithoutWriteInDetail = tabulateElectionResults({
      store,
      includeWriteInAdjudicationResults: false,
    })[GROUP_KEY_ROOT];
    assert(initialResultsWithoutWriteInDetail);

    // verify details of the results without write-in detail
    expect(initialResultsWithoutWriteInDetail.cardCounts).toEqual({
      bmd: 0,
      hmpb: [184],
    });

    const candidateContestId =
      'State-Representatives-Hillsborough-District-34-b1012d38';
    const yesNoContestId =
      'Shall-there-be-a-convention-to-amend-or-revise-the-constitution--15e8b5bc';

    expect(
      initialResultsWithoutWriteInDetail.contestResults[candidateContestId]
    ).toEqual({
      ballots: 184,
      contestId: 'State-Representatives-Hillsborough-District-34-b1012d38',
      contestType: 'candidate',
      overvotes: 30,
      tallies: {
        'Abigail-Bartlett-4e46c9d4': {
          id: 'Abigail-Bartlett-4e46c9d4',
          name: 'Abigail Bartlett',
          tally: 56,
        },
        'Elijah-Miller-a52e6988': {
          id: 'Elijah-Miller-a52e6988',
          name: 'Elijah Miller',
          tally: 56,
        },
        'Isaac-Hill-d6c9deeb': {
          id: 'Isaac-Hill-d6c9deeb',
          name: 'Isaac Hill',
          tally: 56,
        },
        'Jacob-Freese-b5146505': {
          id: 'Jacob-Freese-b5146505',
          name: 'Jacob Freese',
          tally: 56,
        },
        'Mary-Baker-Eddy-350785d5': {
          id: 'Mary-Baker-Eddy-350785d5',
          name: 'Mary Baker Eddy',
          tally: 58,
        },
        'Obadiah-Carrigan-5c95145a': {
          id: 'Obadiah-Carrigan-5c95145a',
          name: 'Obadiah Carrigan',
          tally: 60,
        },
        'Samuel-Bell-17973275': {
          id: 'Samuel-Bell-17973275',
          name: 'Samuel Bell',
          tally: 56,
        },
        'Samuel-Livermore-f927fef1': {
          id: 'Samuel-Livermore-f927fef1',
          name: 'Samuel Livermore',
          tally: 56,
        },
        'write-in': {
          id: 'write-in',
          isWriteIn: true,
          name: 'Write-In',
          tally: 56,
        },
      },
      undervotes: 12,
      votesAllowed: 3,
    });

    expect(
      initialResultsWithoutWriteInDetail.contestResults[yesNoContestId]
    ).toEqual({
      ballots: 184,
      contestId:
        'Shall-there-be-a-convention-to-amend-or-revise-the-constitution--15e8b5bc',
      contestType: 'yesno',
      noTally: 2,
      overvotes: 2,
      undervotes: 178,
      yesTally: 2,
    });

    // since there has been no write-in adjudication yet, the result should the
    // same if we include write-in adjudication data
    const initialResultsWithWriteInDetail = tabulateElectionResults({
      store,
      includeWriteInAdjudicationResults: true,
    })[GROUP_KEY_ROOT];
    assert(initialResultsWithWriteInDetail);
    expect(initialResultsWithWriteInDetail).toEqual(
      initialResultsWithoutWriteInDetail
    );

    // now generate some write-in adjudication data
    const writeIns = store.getWriteInRecords({
      electionId,
      contestId: candidateContestId,
      status: 'pending',
    });
    const [writeIn1, writeIn2, writeIn3, writeIn4, writeIn5, writeIn6] =
      writeIns;
    store.adjudicateWriteIn({
      writeInId: writeIn1!.id,
      type: 'invalid',
    });
    store.adjudicateWriteIn({
      writeInId: writeIn2!.id,
      type: 'invalid',
    });
    store.adjudicateWriteIn({
      writeInId: writeIn3!.id,
      type: 'official-candidate',
      candidateId: 'Obadiah-Carrigan-5c95145a',
    });
    store.adjudicateWriteIn({
      writeInId: writeIn4!.id,
      type: 'official-candidate',
      candidateId: 'Abigail-Bartlett-4e46c9d4',
    });
    const writeInCandidate1 = store.addWriteInCandidate({
      electionId,
      contestId: candidateContestId,
      name: 'Mr. Pickles',
    });
    store.adjudicateWriteIn({
      writeInId: writeIn5!.id,
      type: 'write-in-candidate',
      candidateId: writeInCandidate1.id,
    });
    const writeInCandidate2 = store.addWriteInCandidate({
      electionId,
      contestId: candidateContestId,
      name: 'Ms. Tomato',
    });
    store.adjudicateWriteIn({
      writeInId: writeIn6!.id,
      type: 'write-in-candidate',
      candidateId: writeInCandidate2.id,
    });

    // verify the results are modified with write-in data appropriately
    const modifiedResults = tabulateElectionResults({
      store,
      includeWriteInAdjudicationResults: true,
    })[GROUP_KEY_ROOT];
    assert(modifiedResults);
    expect(modifiedResults.cardCounts).toEqual({
      bmd: 0,
      hmpb: [184],
    });
    expect(modifiedResults.contestResults[candidateContestId]).toEqual({
      ballots: 184,
      contestId: 'State-Representatives-Hillsborough-District-34-b1012d38',
      contestType: 'candidate',
      overvotes: 30,
      tallies: {
        'Abigail-Bartlett-4e46c9d4': {
          id: 'Abigail-Bartlett-4e46c9d4',
          name: 'Abigail Bartlett',
          tally: 57,
        },
        'Elijah-Miller-a52e6988': {
          id: 'Elijah-Miller-a52e6988',
          name: 'Elijah Miller',
          tally: 56,
        },
        'Isaac-Hill-d6c9deeb': {
          id: 'Isaac-Hill-d6c9deeb',
          name: 'Isaac Hill',
          tally: 56,
        },
        'Jacob-Freese-b5146505': {
          id: 'Jacob-Freese-b5146505',
          name: 'Jacob Freese',
          tally: 56,
        },
        'Mary-Baker-Eddy-350785d5': {
          id: 'Mary-Baker-Eddy-350785d5',
          name: 'Mary Baker Eddy',
          tally: 58,
        },
        'Obadiah-Carrigan-5c95145a': {
          id: 'Obadiah-Carrigan-5c95145a',
          name: 'Obadiah Carrigan',
          tally: 61,
        },
        'Samuel-Bell-17973275': {
          id: 'Samuel-Bell-17973275',
          name: 'Samuel Bell',
          tally: 56,
        },
        'Samuel-Livermore-f927fef1': {
          id: 'Samuel-Livermore-f927fef1',
          name: 'Samuel Livermore',
          tally: 56,
        },
        'write-in': {
          id: 'write-in',
          isWriteIn: true,
          name: 'Write-In',
          tally: 50,
        },
        [writeInCandidate1.id]: {
          id: writeInCandidate1.id,
          isWriteIn: true,
          name: 'Mr. Pickles',
          tally: 1,
        },
        [writeInCandidate2.id]: {
          id: writeInCandidate2.id,
          isWriteIn: true,
          name: 'Ms. Tomato',
          tally: 1,
        },
      },
      undervotes: 14,
      votesAllowed: 3,
    });
  });

  test('grouping & filtering by voting method', async () => {
    const store = Store.memoryStore();

    const { electionDefinition, castVoteRecordReport } =
      electionGridLayoutNewHampshireAmherstFixtures;
    const electionId = store.addElection(electionDefinition.electionData);
    store.setCurrentElectionId(electionId);

    const addReportResult = await addCastVoteRecordReport({
      store,
      reportDirectoryPath: castVoteRecordReport.asDirectoryPath(),
      exportedTimestamp: new Date().toISOString(),
      artifactAuthenticator: buildMockArtifactAuthenticator(),
    });
    const { id: fileId } = addReportResult.unsafeUnwrap();

    expect(store.getCastVoteRecordCountByFileId(fileId)).toEqual(184);

    const candidateContestId =
      'State-Representatives-Hillsborough-District-34-b1012d38';
    const yesNoContestId =
      'Shall-there-be-a-convention-to-amend-or-revise-the-constitution--15e8b5bc';

    // check filtered absentee results
    const absenteeResults = tabulateElectionResults({
      store,
      filter: { votingMethods: ['absentee'] },
      includeWriteInAdjudicationResults: true,
    })[GROUP_KEY_ROOT];
    assert(absenteeResults);
    expect(absenteeResults.cardCounts).toEqual({
      bmd: 0,
      hmpb: [92],
    });
    expect(absenteeResults.contestResults[yesNoContestId]).toEqual({
      ballots: 92,
      contestId:
        'Shall-there-be-a-convention-to-amend-or-revise-the-constitution--15e8b5bc',
      contestType: 'yesno',
      noTally: 1,
      overvotes: 1,
      undervotes: 89,
      yesTally: 1,
    });
    expect(absenteeResults.contestResults[candidateContestId]).toEqual({
      ballots: 92,
      contestId: 'State-Representatives-Hillsborough-District-34-b1012d38',
      contestType: 'candidate',
      overvotes: 15,
      tallies: {
        'Abigail-Bartlett-4e46c9d4': {
          id: 'Abigail-Bartlett-4e46c9d4',
          name: 'Abigail Bartlett',
          tally: 28,
        },
        'Elijah-Miller-a52e6988': {
          id: 'Elijah-Miller-a52e6988',
          name: 'Elijah Miller',
          tally: 28,
        },
        'Isaac-Hill-d6c9deeb': {
          id: 'Isaac-Hill-d6c9deeb',
          name: 'Isaac Hill',
          tally: 28,
        },
        'Jacob-Freese-b5146505': {
          id: 'Jacob-Freese-b5146505',
          name: 'Jacob Freese',
          tally: 28,
        },
        'Mary-Baker-Eddy-350785d5': {
          id: 'Mary-Baker-Eddy-350785d5',
          name: 'Mary Baker Eddy',
          tally: 29,
        },
        'Obadiah-Carrigan-5c95145a': {
          id: 'Obadiah-Carrigan-5c95145a',
          name: 'Obadiah Carrigan',
          tally: 30,
        },
        'Samuel-Bell-17973275': {
          id: 'Samuel-Bell-17973275',
          name: 'Samuel Bell',
          tally: 28,
        },
        'Samuel-Livermore-f927fef1': {
          id: 'Samuel-Livermore-f927fef1',
          name: 'Samuel Livermore',
          tally: 28,
        },
        'write-in': {
          id: 'write-in',
          isWriteIn: true,
          name: 'Write-In',
          tally: 28,
        },
      },
      undervotes: 6,
      votesAllowed: 3,
    });

    // filtered precinct results should look the same, based on fixture
    const precinctResults = tabulateElectionResults({
      store,
      filter: { votingMethods: ['precinct'] },
      includeWriteInAdjudicationResults: true,
    })[GROUP_KEY_ROOT];
    assert(precinctResults);
    expect(absenteeResults).toEqual(precinctResults);

    // grouped by voting method results should be the same as when simply filtered
    const resultsGroupedByVotingMethod = tabulateElectionResults({
      store,
      groupBy: { groupByVotingMethod: true },
      includeWriteInAdjudicationResults: true,
    });
    expect(resultsGroupedByVotingMethod['root&absentee']).toEqual({
      votingMethod: 'absentee',
      ...absenteeResults,
    });
    expect(resultsGroupedByVotingMethod['root&precinct']).toEqual({
      votingMethod: 'precinct',
      ...precinctResults,
    });

    // generate write-in adjudication data to test filtering
    const writeIns = store.getWriteInRecords({
      electionId,
      contestId: candidateContestId,
      status: 'pending',
    });
    expect(writeIns.length).toEqual(56);
    for (const writeIn of writeIns) {
      store.adjudicateWriteIn({
        writeInId: writeIn.id,
        type: 'invalid',
      });
    }

    // check absentee results after invalidating write-ins
    const absenteeResultsAdjudicated = tabulateElectionResults({
      store,
      filter: { votingMethods: ['absentee'] },
      includeWriteInAdjudicationResults: true,
    })[GROUP_KEY_ROOT];
    assert(absenteeResultsAdjudicated);
    expect(
      absenteeResultsAdjudicated.contestResults[candidateContestId]
    ).toEqual({
      ballots: 92,
      contestId: 'State-Representatives-Hillsborough-District-34-b1012d38',
      contestType: 'candidate',
      overvotes: 15,
      tallies: {
        'Abigail-Bartlett-4e46c9d4': {
          id: 'Abigail-Bartlett-4e46c9d4',
          name: 'Abigail Bartlett',
          tally: 28,
        },
        'Elijah-Miller-a52e6988': {
          id: 'Elijah-Miller-a52e6988',
          name: 'Elijah Miller',
          tally: 28,
        },
        'Isaac-Hill-d6c9deeb': {
          id: 'Isaac-Hill-d6c9deeb',
          name: 'Isaac Hill',
          tally: 28,
        },
        'Jacob-Freese-b5146505': {
          id: 'Jacob-Freese-b5146505',
          name: 'Jacob Freese',
          tally: 28,
        },
        'Mary-Baker-Eddy-350785d5': {
          id: 'Mary-Baker-Eddy-350785d5',
          name: 'Mary Baker Eddy',
          tally: 29,
        },
        'Obadiah-Carrigan-5c95145a': {
          id: 'Obadiah-Carrigan-5c95145a',
          name: 'Obadiah Carrigan',
          tally: 30,
        },
        'Samuel-Bell-17973275': {
          id: 'Samuel-Bell-17973275',
          name: 'Samuel Bell',
          tally: 28,
        },
        'Samuel-Livermore-f927fef1': {
          id: 'Samuel-Livermore-f927fef1',
          name: 'Samuel Livermore',
          tally: 28,
        },
      },
      undervotes: 34,
      votesAllowed: 3,
    });

    // check results filtered by precinct voting method
    const precinctResultsAdjudicated = tabulateElectionResults({
      store,
      filter: { votingMethods: ['precinct'] },
      includeWriteInAdjudicationResults: true,
    })[GROUP_KEY_ROOT];
    assert(precinctResultsAdjudicated);
    expect(absenteeResultsAdjudicated).toEqual(precinctResultsAdjudicated);

    // check the grouped results
    const adjudicatedResultsByVotingMethod = tabulateElectionResults({
      store,
      groupBy: { groupByVotingMethod: true },
      includeWriteInAdjudicationResults: true,
    });
    expect(adjudicatedResultsByVotingMethod['root&absentee']).toEqual({
      votingMethod: 'absentee',
      ...absenteeResultsAdjudicated,
    });
    expect(adjudicatedResultsByVotingMethod['root&precinct']).toEqual({
      votingMethod: 'precinct',
      ...precinctResultsAdjudicated,
    });
  });
});
