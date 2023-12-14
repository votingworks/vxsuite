import {
  electionGridLayoutNewHampshireTestBallotFixtures,
  electionTwoPartyPrimaryFixtures,
} from '@votingworks/fixtures';
import {
  BooleanEnvironmentVariableName,
  buildManualResultsFixture,
  getFeatureFlagMock,
} from '@votingworks/utils';
import {
  buildTestEnvironment,
  configureMachine,
  mockElectionManagerAuth,
} from '../test/app';

jest.setTimeout(60_000);

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
  featureFlagMock.enableFeatureFlag(
    BooleanEnvironmentVariableName.SKIP_CAST_VOTE_RECORDS_AUTHENTICATION
  );
});

afterEach(() => {
  featureFlagMock.resetFeatureFlags();
});

test('card counts', async () => {
  const { electionDefinition, castVoteRecordExport } =
    electionTwoPartyPrimaryFixtures;
  const { election } = electionDefinition;

  const { apiClient, auth } = buildTestEnvironment();
  await configureMachine(apiClient, auth, electionDefinition);
  mockElectionManagerAuth(auth, electionDefinition.electionHash);

  const loadFileResult = await apiClient.addCastVoteRecordFile({
    path: castVoteRecordExport.asDirectoryPath(),
  });
  loadFileResult.assertOk('load file failed');

  await apiClient.setManualResults({
    precinctId: 'precinct-1',
    ballotStyleId: '1M',
    votingMethod: 'precinct',
    manualResults: buildManualResultsFixture({
      election,
      ballotCount: 10,
      contestResultsSummaries: {},
    }),
  });

  expect(
    await apiClient.getCardCounts({
      filter: { ballotStyleIds: ['1M'] },
      groupBy: { groupByPrecinct: true },
    })
  ).toEqual([
    {
      precinctId: 'precinct-1',
      bmd: 28,
      hmpb: [],
      manual: 10,
    },
    {
      precinctId: 'precinct-2',
      bmd: 28,
      hmpb: [],
      manual: 0,
    },
  ]);
});

test('election write-in adjudication summary', async () => {
  const { electionDefinition, castVoteRecordExport } =
    electionGridLayoutNewHampshireTestBallotFixtures;
  const { election } = electionDefinition;

  const { apiClient, auth } = buildTestEnvironment();
  await configureMachine(apiClient, auth, electionDefinition);
  mockElectionManagerAuth(auth, electionDefinition.electionHash);

  const loadFileResult = await apiClient.addCastVoteRecordFile({
    path: castVoteRecordExport.asDirectoryPath(),
  });
  loadFileResult.assertOk('load file failed');

  const writeInContestId =
    'State-Representatives-Hillsborough-District-34-b1012d38';

  // initially, all pending
  expect(
    (await apiClient.getElectionWriteInSummary()).contestWriteInSummaries[
      writeInContestId
    ]
  ).toEqual({
    candidateTallies: {},
    contestId: 'State-Representatives-Hillsborough-District-34-b1012d38',
    invalidTally: 0,
    pendingTally: 56,
    totalTally: 56,
  });

  const writeInIds = await apiClient.getWriteInAdjudicationQueue({
    contestId: writeInContestId,
  });

  const unofficialCandidate1 = await apiClient.addWriteInCandidate({
    contestId: writeInContestId,
    name: 'Unofficial Candidate 1',
  });

  // generate some adjudication information
  for (const [i, writeInId] of writeInIds.entries()) {
    if (i < 24) {
      await apiClient.adjudicateWriteIn({
        writeInId,
        type: 'write-in-candidate',
        candidateId: unofficialCandidate1.id,
      });
    } else if (i < 48) {
      await apiClient.adjudicateWriteIn({
        writeInId,
        type: 'official-candidate',
        candidateId: 'Obadiah-Carrigan-5c95145a',
      });
    } else {
      await apiClient.adjudicateWriteIn({
        writeInId,
        type: 'invalid',
      });
    }
  }

  // with scanned adjudication data
  expect(
    (await apiClient.getElectionWriteInSummary()).contestWriteInSummaries[
      writeInContestId
    ]
  ).toEqual({
    candidateTallies: {
      [unofficialCandidate1.id]: {
        id: unofficialCandidate1.id,
        isWriteIn: true,
        name: 'Unofficial Candidate 1',
        tally: 24,
      },
      'Obadiah-Carrigan-5c95145a': {
        id: 'Obadiah-Carrigan-5c95145a',
        isWriteIn: false,
        name: 'Obadiah Carrigan',
        tally: 24,
      },
    },
    contestId: 'State-Representatives-Hillsborough-District-34-b1012d38',
    invalidTally: 8,
    pendingTally: 0,
    totalTally: 56,
  });

  // add manual data
  const unofficialCandidate2 = await apiClient.addWriteInCandidate({
    contestId: writeInContestId,
    name: 'Unofficial Candidate 2',
  });
  await apiClient.setManualResults({
    ballotStyleId: 'card-number-3',
    votingMethod: 'precinct',
    precinctId: 'town-id-00701-precinct-id-',
    manualResults: buildManualResultsFixture({
      election,
      ballotCount: 25,
      contestResultsSummaries: {
        [writeInContestId]: {
          type: 'candidate',
          ballots: 25,
          overvotes: 3,
          undervotes: 2,
          writeInOptionTallies: {
            [unofficialCandidate1.id]: {
              name: 'Unofficial Candidate 1',
              tally: 5,
            },
            [unofficialCandidate2.id]: {
              name: 'Unofficial Candidate 2',
              tally: 4,
            },
          },
          officialOptionTallies: {
            'Obadiah-Carrigan-5c95145a': 11,
          },
        },
      },
    }),
  });

  // now with manual data
  expect(
    (await apiClient.getElectionWriteInSummary()).contestWriteInSummaries[
      writeInContestId
    ]
  ).toEqual({
    candidateTallies: {
      'Obadiah-Carrigan-5c95145a': {
        id: 'Obadiah-Carrigan-5c95145a',
        isWriteIn: false,
        name: 'Obadiah Carrigan',
        tally: 24, // official candidate tallies should be unaffected by manual results
      },
      [unofficialCandidate2.id]: {
        id: unofficialCandidate2.id,
        isWriteIn: true,
        name: 'Unofficial Candidate 2',
        tally: 4, // includes manual tallies for write-in candidates
      },
      [unofficialCandidate1.id]: {
        id: unofficialCandidate1.id,
        isWriteIn: true,
        name: 'Unofficial Candidate 1',
        tally: 29, // includes manual tallies for write-in candidates
      },
    },
    contestId: 'State-Representatives-Hillsborough-District-34-b1012d38',
    invalidTally: 8,
    pendingTally: 0,
    totalTally: 65, // total should now include manual tally subtotal
  });
});
