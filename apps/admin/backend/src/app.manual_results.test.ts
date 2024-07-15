import { electionTwoPartyPrimaryFixtures } from '@votingworks/fixtures';

import { BallotStyleId, PrecinctId, Tabulation } from '@votingworks/types';
import { buildManualResultsFixture } from '@votingworks/utils';
import { assert } from '@votingworks/basics';
import { LogEventId } from '@votingworks/logging';
import {
  buildTestEnvironment,
  configureMachine,
  mockElectionManagerAuth,
} from '../test/app';
import { ManualResultsIdentifier } from './types';

beforeEach(() => {
  jest.restoreAllMocks();
});

const { electionDefinition } = electionTwoPartyPrimaryFixtures;
const { election } = electionDefinition;

test('manual results flow (official candidates only)', async () => {
  const { apiClient, auth, logger } = buildTestEnvironment();

  await configureMachine(apiClient, auth, electionDefinition);

  mockElectionManagerAuth(auth, electionDefinition.election);

  // define some manual tallies... manually
  const resultsPrecinct1MammalBallotStyle = buildManualResultsFixture({
    election,
    ballotCount: 10,
    contestResultsSummaries: {
      'best-animal-mammal': {
        type: 'candidate',
        overvotes: 1,
        undervotes: 0,
        ballots: 10,
        officialOptionTallies: {
          horse: 4,
          otter: 3,
          fox: 2,
        },
      },
    },
  });

  const resultsPrecinct2MammalBallotStyle = buildManualResultsFixture({
    election,
    ballotCount: 10,
    contestResultsSummaries: {
      'best-animal-mammal': {
        type: 'candidate',
        overvotes: 0,
        undervotes: 1,
        ballots: 10,
        officialOptionTallies: {
          horse: 2,
          otter: 3,
          fox: 4,
        },
      },
    },
  });

  const resultsPrecinct1FishBallotStyle = buildManualResultsFixture({
    election,
    ballotCount: 10,
    contestResultsSummaries: {
      'best-animal-fish': {
        type: 'candidate',
        overvotes: 1,
        undervotes: 0,
        ballots: 10,
        officialOptionTallies: {
          seahorse: 4,
          salmon: 5,
        },
      },
    },
  });

  const resultsPrecinct2FishBallotStyle = buildManualResultsFixture({
    election,
    ballotCount: 10,
    contestResultsSummaries: {
      'best-animal-fish': {
        type: 'candidate',
        overvotes: 0,
        undervotes: 1,
        ballots: 10,
        officialOptionTallies: {
          seahorse: 5,
          salmon: 4,
        },
      },
    },
  });

  // check there is initially no manual results data
  expect(await apiClient.getManualResultsMetadata()).toEqual([]);
  expect(
    await apiClient.getManualResults({
      precinctId: 'precinct-1',
      ballotStyleId: '1M',
      votingMethod: 'precinct',
    })
  ).toBeNull();

  // add our manual results
  const manualResultsToAdd: Array<
    [
      precinctId: PrecinctId,
      ballotStyleId: BallotStyleId,
      manualResults: Tabulation.ManualElectionResults,
    ]
  > = [
    ['precinct-1', '1M', resultsPrecinct1MammalBallotStyle],
    ['precinct-1', '2F', resultsPrecinct1FishBallotStyle],
    ['precinct-2', '1M', resultsPrecinct2MammalBallotStyle],
    ['precinct-2', '2F', resultsPrecinct2FishBallotStyle],
  ];

  for (const [precinctId, ballotStyleId, manualResults] of manualResultsToAdd) {
    await apiClient.setManualResults({
      precinctId,
      ballotStyleId,
      votingMethod: 'precinct',
      manualResults,
    });
    expect(logger.log).toHaveBeenLastCalledWith(
      LogEventId.ManualTallyDataEdited,
      'election_manager',
      {
        disposition: 'success',
        message:
          'User added or edited manually entered tally data for a particular ballot style, precinct, and voting method.',
        ballotCount: manualResults.ballotCount,
        ballotStyleId,
        precinctId,
        ballotType: 'precinct',
      }
    );
  }

  // check metadata request
  const manualResultsMetadataRecords =
    await apiClient.getManualResultsMetadata();
  expect(manualResultsMetadataRecords).toHaveLength(4);
  for (const [precinctId, ballotStyleId, manualResults] of manualResultsToAdd) {
    expect(manualResultsMetadataRecords).toContainEqual(
      expect.objectContaining({
        precinctId,
        ballotStyleId,
        votingMethod: 'precinct',
        ballotCount: manualResults.ballotCount,
      })
    );
  }

  // check retrieving individual tally
  const manualResultsRecord = await apiClient.getManualResults({
    precinctId: 'precinct-1',
    ballotStyleId: '1M',
    votingMethod: 'precinct',
  });
  assert(manualResultsRecord);
  expect(manualResultsRecord.manualResults).toEqual(
    resultsPrecinct1MammalBallotStyle
  );
  expect(manualResultsRecord.ballotStyleId).toEqual('1M');
  expect(manualResultsRecord.precinctId).toEqual('precinct-1');
  expect(manualResultsRecord.votingMethod).toEqual('precinct');

  // delete a single manual tally
  const deletedResultsIdentifier: ManualResultsIdentifier = {
    ballotStyleId: '1M',
    precinctId: 'precinct-1',
    votingMethod: 'precinct',
  };
  expect(await apiClient.getManualResultsMetadata()).toHaveLength(4);
  await apiClient.deleteManualResults(deletedResultsIdentifier);
  expect(await apiClient.getManualResultsMetadata()).toHaveLength(3);
  expect(logger.log).toHaveBeenLastCalledWith(
    LogEventId.ManualTallyDataRemoved,
    'election_manager',
    {
      disposition: 'success',
      message:
        'User removed manually entered tally data for a particular ballot style, precinct, and voting method.',
      ...deletedResultsIdentifier,
    }
  );

  // delete all manual tallies
  await apiClient.deleteAllManualResults();
  expect(await apiClient.getManualResultsMetadata()).toHaveLength(0);
  expect(logger.log).toHaveBeenLastCalledWith(
    LogEventId.ManualTallyDataRemoved,
    'election_manager',
    {
      disposition: 'success',
      message: 'User removed all manually entered tally data.',
    }
  );
});

test('ignores write-ins with zero votes', async () => {
  const { apiClient, auth } = buildTestEnvironment();

  await configureMachine(apiClient, auth, electionDefinition);

  mockElectionManagerAuth(auth, electionDefinition.election);

  const manualResultsWithZeroCountWriteIns = buildManualResultsFixture({
    election,
    ballotCount: 10,
    contestResultsSummaries: {
      'best-animal-mammal': {
        type: 'candidate',
        overvotes: 1,
        undervotes: 0,
        ballots: 10,
        officialOptionTallies: {
          horse: 4,
          otter: 3,
          fox: 2,
        },
        writeInOptionTallies: {
          chimera: {
            tally: 0,
            name: 'Chimera',
          },
          'temp-write-in-(Bob)': {
            tally: 0,
            name: 'Bob',
          },
        },
      },
    },
  });

  await apiClient.setManualResults({
    precinctId: 'precinct-1',
    votingMethod: 'precinct',
    ballotStyleId: '1M',
    manualResults: manualResultsWithZeroCountWriteIns,
  });

  // check results after setting a tally with a zero write-in candidate
  expect(await apiClient.getWriteInCandidates()).toHaveLength(0);
  expect(
    (
      await apiClient.getManualResults({
        precinctId: 'precinct-1',
        votingMethod: 'precinct',
        ballotStyleId: '1M',
      })
    )?.manualResults
  ).toEqual(
    buildManualResultsFixture({
      election,
      ballotCount: 10,
      contestResultsSummaries: {
        'best-animal-mammal': {
          type: 'candidate',
          overvotes: 1,
          undervotes: 0,
          ballots: 10,
          officialOptionTallies: {
            horse: 4,
            otter: 3,
            fox: 2,
          },
        },
      },
    })
  );
});

test('adds temp write-in candidates', async () => {
  const { apiClient, auth } = buildTestEnvironment();

  await configureMachine(apiClient, auth, electionDefinition);

  mockElectionManagerAuth(auth, electionDefinition.election);

  // initially no write-in candidates
  expect(await apiClient.getWriteInCandidates()).toHaveLength(0);

  const manualResultsWithTempWriteIn = buildManualResultsFixture({
    election,
    ballotCount: 10,
    contestResultsSummaries: {
      'best-animal-mammal': {
        type: 'candidate',
        overvotes: 1,
        undervotes: 0,
        ballots: 10,
        officialOptionTallies: {
          horse: 4,
          otter: 3,
          fox: 2,
        },
        writeInOptionTallies: {
          'temp-write-in-(Bob)': {
            tally: 1,
            name: 'Bob',
          },
        },
      },
    },
  });

  await apiClient.setManualResults({
    precinctId: 'precinct-1',
    votingMethod: 'precinct',
    ballotStyleId: '1M',
    manualResults: manualResultsWithTempWriteIn,
  });

  const writeInCandidates = await apiClient.getWriteInCandidates();
  expect(writeInCandidates).toHaveLength(1);
  const writeInCandidateId = writeInCandidates[0]!.id;

  expect(
    (
      await apiClient.getManualResults({
        precinctId: 'precinct-1',
        votingMethod: 'precinct',
        ballotStyleId: '1M',
      })
    )?.manualResults
  ).toEqual(
    buildManualResultsFixture({
      election,
      ballotCount: 10,
      contestResultsSummaries: {
        'best-animal-mammal': {
          type: 'candidate',
          overvotes: 1,
          undervotes: 0,
          ballots: 10,
          officialOptionTallies: {
            horse: 4,
            otter: 3,
            fox: 2,
          },
          writeInOptionTallies: {
            [writeInCandidateId]: {
              tally: 1,
              name: 'Bob',
            },
          },
        },
      },
    })
  );
});

test('removes write-in candidates not referenced anymore', async () => {
  const { apiClient, auth } = buildTestEnvironment();

  await configureMachine(apiClient, auth, electionDefinition);

  mockElectionManagerAuth(auth, electionDefinition.election);

  expect(await apiClient.getWriteInCandidates()).toHaveLength(0);

  await apiClient.addWriteInCandidate({
    contestId: 'best-animal-mammal',
    name: 'Chimera',
  });
  const writeInCandidates = await apiClient.getWriteInCandidates();
  expect(writeInCandidates).toHaveLength(1);
  const writeInCandidateId = writeInCandidates[0]!.id;

  const manualResultsWithExistingWriteIn = buildManualResultsFixture({
    election,
    ballotCount: 10,
    contestResultsSummaries: {
      'best-animal-mammal': {
        type: 'candidate',
        overvotes: 1,
        undervotes: 0,
        ballots: 10,
        officialOptionTallies: {
          horse: 4,
          otter: 3,
          fox: 2,
        },
        writeInOptionTallies: {
          [writeInCandidateId]: {
            tally: 1,
            name: 'Chimera',
          },
        },
      },
    },
  });
  await apiClient.setManualResults({
    precinctId: 'precinct-1',
    votingMethod: 'precinct',
    ballotStyleId: '1M',
    manualResults: manualResultsWithExistingWriteIn,
  });
  expect(await apiClient.getWriteInCandidates()).toHaveLength(1);
  expect(
    (
      await apiClient.getManualResults({
        precinctId: 'precinct-1',
        votingMethod: 'precinct',
        ballotStyleId: '1M',
      })
    )?.manualResults
  ).toEqual(manualResultsWithExistingWriteIn);

  const manualResultsWithWriteInRemoved = buildManualResultsFixture({
    election,
    ballotCount: 10,
    contestResultsSummaries: {
      'best-animal-mammal': {
        type: 'candidate',
        overvotes: 1,
        undervotes: 0,
        ballots: 10,
        officialOptionTallies: {
          horse: 4,
          otter: 3,
          fox: 2,
        },
      },
    },
  });
  await apiClient.setManualResults({
    precinctId: 'precinct-1',
    votingMethod: 'precinct',
    ballotStyleId: '1M',
    manualResults: manualResultsWithWriteInRemoved,
  });
  expect(await apiClient.getWriteInCandidates()).toHaveLength(0);
  expect(
    (
      await apiClient.getManualResults({
        precinctId: 'precinct-1',
        votingMethod: 'precinct',
        ballotStyleId: '1M',
      })
    )?.manualResults
  ).toEqual(manualResultsWithWriteInRemoved);
});
