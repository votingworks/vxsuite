import { electionMinimalExhaustiveSampleFixtures } from '@votingworks/fixtures';

import {
  BallotStyleId,
  ManualTally,
  PrecinctId,
  TallyCategory,
  VotingMethod,
} from '@votingworks/types';
import { buildSpecificManualTally } from '@votingworks/utils';
import { assert } from '@votingworks/basics';
import { LogEventId } from '@votingworks/logging';
import {
  buildTestEnvironment,
  configureMachine,
  mockElectionManagerAuth,
} from '../test/app';
import { ManualTallyIdentifier } from './types';

beforeEach(() => {
  jest.restoreAllMocks();
});

const { electionDefinition } = electionMinimalExhaustiveSampleFixtures;
const { election } = electionDefinition;

test('manual tally flow (official candidates only)', async () => {
  const { apiClient, auth, logger } = buildTestEnvironment();

  await configureMachine(apiClient, auth, electionDefinition);

  mockElectionManagerAuth(auth, electionDefinition.electionHash);

  // define some manual tallies... manually
  const tallyPrecinct1MammalBallotStyle = buildSpecificManualTally(
    election,
    10,
    {
      'best-animal-mammal': {
        overvotes: 1,
        undervotes: 0,
        ballots: 10,
        officialOptionTallies: {
          horse: 4,
          otter: 3,
          fox: 2,
        },
      },
    }
  );

  const tallyPrecinct2MammalBallotStyle = buildSpecificManualTally(
    election,
    10,
    {
      'best-animal-mammal': {
        overvotes: 0,
        undervotes: 1,
        ballots: 10,
        officialOptionTallies: {
          horse: 2,
          otter: 3,
          fox: 4,
        },
      },
    }
  );

  const tallyPrecinct1FishBallotStyle = buildSpecificManualTally(election, 10, {
    'best-animal-fish': {
      overvotes: 1,
      undervotes: 0,
      ballots: 10,
      officialOptionTallies: {
        seahorse: 4,
        salmon: 5,
      },
    },
  });

  const tallyPrecinct2FishBallotStyle = buildSpecificManualTally(election, 10, {
    'best-animal-fish': {
      overvotes: 0,
      undervotes: 1,
      ballots: 10,
      officialOptionTallies: {
        seahorse: 5,
        salmon: 4,
      },
    },
  });

  // check there is initially no manual tally data
  expect(await apiClient.getFullElectionManualTally()).toBeNull();
  expect(await apiClient.getManualTallyMetadata()).toEqual([]);
  expect(
    await apiClient.getManualTally({
      precinctId: 'precinct-1',
      ballotStyleId: '1M',
      ballotType: 'precinct',
    })
  ).toBeNull();

  // add our manual tallies
  const manualTalliesToAdd: Array<
    [
      precinctId: PrecinctId,
      ballotStyleId: BallotStyleId,
      manaulTally: ManualTally
    ]
  > = [
    ['precinct-1', '1M', tallyPrecinct1MammalBallotStyle],
    ['precinct-1', '2F', tallyPrecinct1FishBallotStyle],
    ['precinct-2', '1M', tallyPrecinct2MammalBallotStyle],
    ['precinct-2', '2F', tallyPrecinct2FishBallotStyle],
  ];

  for (const [precinctId, ballotStyleId, manualTally] of manualTalliesToAdd) {
    await apiClient.setManualTally({
      precinctId,
      ballotStyleId,
      ballotType: 'precinct',
      manualTally,
    });
    expect(logger.log).toHaveBeenLastCalledWith(
      LogEventId.ManualTallyDataEdited,
      'election_manager',
      {
        disposition: 'success',
        message:
          'User added or edited manually entered tally data for a particular ballot style, precinct, and voting method.',
        numberOfBallots: manualTally.numberOfBallotsCounted,
        ballotStyleId,
        precinctId,
        ballotType: 'precinct',
      }
    );
  }

  // check metadata request
  const manualTallyMetadataRecords = await apiClient.getManualTallyMetadata();
  expect(manualTallyMetadataRecords).toHaveLength(4);
  for (const [precinctId, ballotStyleId, manualTally] of manualTalliesToAdd) {
    expect(manualTallyMetadataRecords).toContainEqual(
      expect.objectContaining({
        precinctId,
        ballotStyleId,
        ballotType: 'precinct',
        ballotCount: manualTally.numberOfBallotsCounted,
      })
    );
  }

  // check overall tally
  const fullElectionManualTally = await apiClient.getFullElectionManualTally();
  assert(fullElectionManualTally);
  expect(fullElectionManualTally.votingMethod).toEqual(VotingMethod.Precinct);
  expect(fullElectionManualTally.overallTally).toEqual(
    buildSpecificManualTally(election, 40, {
      'best-animal-mammal': {
        overvotes: 1,
        undervotes: 1,
        ballots: 20,
        officialOptionTallies: {
          horse: 6,
          otter: 6,
          fox: 6,
        },
      },
      'best-animal-fish': {
        overvotes: 1,
        undervotes: 1,
        ballots: 20,
        officialOptionTallies: {
          seahorse: 9,
          salmon: 9,
        },
      },
    })
  );

  // check tallies by precinct
  expect(
    fullElectionManualTally.resultsByCategory[TallyCategory.Precinct]?.[
      'precinct-1'
    ]
  ).toEqual(
    buildSpecificManualTally(election, 20, {
      'best-animal-mammal': {
        overvotes: 1,
        undervotes: 0,
        ballots: 10,
        officialOptionTallies: {
          horse: 4,
          otter: 3,
          fox: 2,
        },
      },
      'best-animal-fish': {
        overvotes: 1,
        undervotes: 0,
        ballots: 10,
        officialOptionTallies: {
          seahorse: 4,
          salmon: 5,
        },
      },
    })
  );

  // check tallies by party
  expect(
    fullElectionManualTally.resultsByCategory[TallyCategory.Party]?.['0']
  ).toEqual(
    buildSpecificManualTally(election, 20, {
      'best-animal-mammal': {
        overvotes: 1,
        undervotes: 1,
        ballots: 20,
        officialOptionTallies: {
          horse: 6,
          otter: 6,
          fox: 6,
        },
      },
    })
  );

  // check retrieving individual tally
  const manualTallyRecord = await apiClient.getManualTally({
    precinctId: 'precinct-1',
    ballotStyleId: '1M',
    ballotType: 'precinct',
  });
  assert(manualTallyRecord);
  expect(manualTallyRecord.manualTally).toEqual(
    tallyPrecinct1MammalBallotStyle
  );
  expect(manualTallyRecord.ballotStyleId).toEqual('1M');
  expect(manualTallyRecord.precinctId).toEqual('precinct-1');
  expect(manualTallyRecord.ballotType).toEqual('precinct');

  // delete a single manual tally
  const deletedTallyIdentifier: ManualTallyIdentifier = {
    ballotStyleId: '1M',
    precinctId: 'precinct-1',
    ballotType: 'precinct',
  };
  expect(await apiClient.getManualTallyMetadata()).toHaveLength(4);
  await apiClient.deleteManualTally(deletedTallyIdentifier);
  expect(await apiClient.getManualTallyMetadata()).toHaveLength(3);
  expect(logger.log).toHaveBeenLastCalledWith(
    LogEventId.ManualTallyDataRemoved,
    'election_manager',
    {
      disposition: 'success',
      message:
        'User removed manually entered tally data for a particular ballot style, precinct, and voting method.',
      ...deletedTallyIdentifier,
    }
  );

  // delete all manual tallies
  await apiClient.deleteAllManualTallies();
  expect(await apiClient.getManualTallyMetadata()).toHaveLength(0);
  expect(await apiClient.getFullElectionManualTally()).toBeNull();
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

  mockElectionManagerAuth(auth, electionDefinition.electionHash);

  const manualTallyWithoutWriteIn = buildSpecificManualTally(election, 10, {
    'best-animal-mammal': {
      overvotes: 1,
      undervotes: 0,
      ballots: 10,
      officialOptionTallies: {
        horse: 4,
        otter: 3,
        fox: 2,
      },
    },
  });

  const manualTallyWithZeroCountWriteIns = buildSpecificManualTally(
    election,
    10,
    {
      'best-animal-mammal': {
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
            count: 0,
            candidate: {
              id: 'chimera',
              name: 'Chimera',
              isWriteIn: true,
            },
          },
          'temp-write-in-(Bob)': {
            count: 0,
            candidate: {
              id: 'temp-write-in-(Bob)',
              name: 'Bob',
              isWriteIn: true,
            },
          },
        },
      },
    }
  );

  await apiClient.setManualTally({
    precinctId: 'precinct-1',
    ballotType: 'precinct',
    ballotStyleId: '1M',
    manualTally: manualTallyWithZeroCountWriteIns,
  });

  // check results after setting a tally with a zero write-in candidate
  expect(await apiClient.getWriteInCandidates()).toHaveLength(0);
  const fullElectionManualTally = await apiClient.getFullElectionManualTally();
  expect(fullElectionManualTally!.overallTally).toMatchObject(
    manualTallyWithoutWriteIn
  );
});

test('adds temp write-in candidates', async () => {
  const { apiClient, auth } = buildTestEnvironment();

  await configureMachine(apiClient, auth, electionDefinition);

  mockElectionManagerAuth(auth, electionDefinition.electionHash);

  // initially no full election tally or write-in candidates
  expect(await apiClient.getFullElectionManualTally()).toBeNull();
  expect(await apiClient.getWriteInCandidates()).toHaveLength(0);

  const manualTallyWithTempWriteIn = buildSpecificManualTally(election, 10, {
    'best-animal-mammal': {
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
          count: 1,
          candidate: {
            id: 'temp-write-in-(Bob)',
            name: 'Bob',
            isWriteIn: true,
          },
        },
      },
    },
  });

  await apiClient.setManualTally({
    precinctId: 'precinct-1',
    ballotType: 'precinct',
    ballotStyleId: '1M',
    manualTally: manualTallyWithTempWriteIn,
  });

  const writeInCandidates = await apiClient.getWriteInCandidates();
  expect(writeInCandidates).toHaveLength(1);
  const writeInCandidateId = writeInCandidates[0]!.id;

  const manualTallyWithWriteIn = buildSpecificManualTally(election, 10, {
    'best-animal-mammal': {
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
          count: 1,
          candidate: {
            id: writeInCandidateId,
            name: 'Bob',
            isWriteIn: true,
          },
        },
      },
    },
  });

  const fullElectionManualTally = await apiClient.getFullElectionManualTally();
  expect(fullElectionManualTally!.overallTally).toMatchObject(
    manualTallyWithWriteIn
  );
});

test('removes write-in candidates not referenced anymore', async () => {
  const { apiClient, auth } = buildTestEnvironment();

  await configureMachine(apiClient, auth, electionDefinition);

  mockElectionManagerAuth(auth, electionDefinition.electionHash);

  expect(await apiClient.getFullElectionManualTally()).toBeNull();
  expect(await apiClient.getWriteInCandidates()).toHaveLength(0);

  await apiClient.addWriteInCandidate({
    contestId: 'best-animal-mammal',
    name: 'Chimera',
  });
  const writeInCandidates = await apiClient.getWriteInCandidates();
  expect(writeInCandidates).toHaveLength(1);
  const writeInCandidateId = writeInCandidates[0]!.id;

  const manualTallyWithExistingWriteIn = buildSpecificManualTally(
    election,
    10,
    {
      'best-animal-mammal': {
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
            count: 1,
            candidate: {
              id: writeInCandidateId,
              name: 'Chimera',
              isWriteIn: true,
            },
          },
        },
      },
    }
  );

  await apiClient.setManualTally({
    precinctId: 'precinct-1',
    ballotType: 'precinct',
    ballotStyleId: '1M',
    manualTally: manualTallyWithExistingWriteIn,
  });
  expect(await apiClient.getWriteInCandidates()).toHaveLength(1);
  expect((await apiClient.getFullElectionManualTally())!.overallTally).toEqual(
    manualTallyWithExistingWriteIn
  );

  const manualTallyWithWriteInRemoved = buildSpecificManualTally(election, 10, {
    'best-animal-mammal': {
      overvotes: 1,
      undervotes: 0,
      ballots: 10,
      officialOptionTallies: {
        horse: 4,
        otter: 3,
        fox: 2,
      },
    },
  });

  await apiClient.setManualTally({
    precinctId: 'precinct-1',
    ballotType: 'precinct',
    ballotStyleId: '1M',
    manualTally: manualTallyWithWriteInRemoved,
  });
  expect(await apiClient.getWriteInCandidates()).toHaveLength(0);
  expect((await apiClient.getFullElectionManualTally())!.overallTally).toEqual(
    manualTallyWithWriteInRemoved
  );
});
