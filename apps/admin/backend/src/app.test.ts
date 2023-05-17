import { assert, find } from '@votingworks/basics';
import {
  electionMinimalExhaustiveSampleDefinition,
  electionMinimalExhaustiveSampleFixtures,
  electionSampleCdfDefinition,
} from '@votingworks/fixtures';
import { LogEventId } from '@votingworks/logging';

import { suppressingConsoleOutput } from '@votingworks/test-utils';
import {
  ContestOptionTally,
  DEFAULT_SYSTEM_SETTINGS,
  Dictionary,
  ManualTally,
  TallyCategory,
} from '@votingworks/types';
import {
  buildTestEnvironment,
  configureMachine,
  mockElectionManagerAuth,
  mockSystemAdministratorAuth,
} from '../test/app';

beforeEach(() => {
  jest.restoreAllMocks();
});

test('uses machine config from env', async () => {
  const originalEnv = process.env;
  process.env = {
    ...originalEnv,
    VX_MACHINE_ID: 'test-machine-id',
    VX_CODE_VERSION: 'test-code-version',
  };

  const { apiClient } = buildTestEnvironment();
  expect(await apiClient.getMachineConfig()).toEqual({
    machineId: 'test-machine-id',
    codeVersion: 'test-code-version',
  });

  process.env = originalEnv;
});

test('uses default machine config if not set', async () => {
  const { apiClient } = buildTestEnvironment();
  expect(await apiClient.getMachineConfig()).toEqual({
    machineId: '0000',
    codeVersion: 'dev',
  });
});

test('managing the current election', async () => {
  const { apiClient, auth, logger } = buildTestEnvironment();

  mockSystemAdministratorAuth(auth);

  expect(await apiClient.getCurrentElectionMetadata()).toBeNull();
  expect(await apiClient.getCastVoteRecords()).toHaveLength(0);

  // try configuring with malformed election data
  const badConfigureResult = await apiClient.configure({ electionData: '{}' });
  assert(badConfigureResult.isErr());
  expect(badConfigureResult.err().type).toEqual('parsing');

  const { electionDefinition } = electionMinimalExhaustiveSampleFixtures;
  const { electionData, electionHash } = electionDefinition;

  // configure with well-formed election data
  const configureResult = await apiClient.configure({
    electionData,
  });
  assert(configureResult.isOk());
  const { electionId } = configureResult.ok();
  expect(logger.log).toHaveBeenNthCalledWith(
    1,
    LogEventId.ElectionConfigured,
    'system_administrator',
    {
      disposition: 'success',
      newElectionHash: electionHash,
    }
  );

  expect(await apiClient.getCurrentElectionMetadata()).toMatchObject({
    isOfficialResults: false,
    id: electionId,
    electionDefinition,
  });

  // mark results as official as election manager
  mockElectionManagerAuth(auth, electionHash);
  await apiClient.markResultsOfficial();
  expect(logger.log).toHaveBeenNthCalledWith(
    2,
    LogEventId.MarkedTallyResultsOfficial,
    'election_manager',
    expect.objectContaining({
      disposition: 'success',
    })
  );
  expect(await apiClient.getCurrentElectionMetadata()).toMatchObject({
    isOfficialResults: true,
    id: electionId,
    electionDefinition,
  });

  // unconfigure as system administrator
  mockSystemAdministratorAuth(auth);
  await apiClient.unconfigure();
  expect(logger.log).toHaveBeenNthCalledWith(
    3,
    LogEventId.ElectionUnconfigured,
    'system_administrator',
    expect.objectContaining({
      disposition: 'success',
    })
  );
  expect(await apiClient.getCurrentElectionMetadata()).toBeNull();

  // confirm we can reconfigure on same app instance
  void (await apiClient.configure({
    electionData,
  }));
  expect(await apiClient.getCurrentElectionMetadata()).toMatchObject({
    isOfficialResults: false,
    electionDefinition,
  });
});

test('configuring with a CDF election', async () => {
  const { apiClient, auth, logger } = buildTestEnvironment();

  mockSystemAdministratorAuth(auth);

  const { electionData, electionHash } = electionSampleCdfDefinition;

  // configure with well-formed election data
  const configureResult = await apiClient.configure({
    electionData,
  });
  assert(configureResult.isOk());
  configureResult.ok();
  expect(logger.log).toHaveBeenNthCalledWith(
    1,
    LogEventId.ElectionConfigured,
    'system_administrator',
    {
      disposition: 'success',
      newElectionHash: electionHash,
    }
  );

  const currentElectionMetadata = await apiClient.getCurrentElectionMetadata();
  expect(currentElectionMetadata?.electionDefinition.electionData).toEqual(
    electionData
  );
  expect(currentElectionMetadata?.electionDefinition.electionHash).toEqual(
    electionHash
  );
});

test('setSystemSettings happy path', async () => {
  const { apiClient, auth, logger } = buildTestEnvironment();

  const { electionDefinition, systemSettings } =
    electionMinimalExhaustiveSampleFixtures;
  await configureMachine(apiClient, auth, electionDefinition);

  mockSystemAdministratorAuth(auth);

  const result = await apiClient.setSystemSettings({
    systemSettings: systemSettings.asText(),
  });
  assert(result.isOk());

  // Logger call 1 is made by configureMachine when loading the election definition
  expect(logger.log).toHaveBeenNthCalledWith(
    2,
    LogEventId.SystemSettingsSaveInitiated,
    'system_administrator',
    { disposition: 'na' }
  );
  expect(logger.log).toHaveBeenNthCalledWith(
    3,
    LogEventId.SystemSettingsSaved,
    'system_administrator',
    { disposition: 'success' }
  );
});

test('setSystemSettings throws error when store.saveSystemSettings fails', async () => {
  const { apiClient, auth, workspace, logger } = buildTestEnvironment();
  const { electionDefinition, systemSettings } =
    electionMinimalExhaustiveSampleFixtures;
  await configureMachine(apiClient, auth, electionDefinition);
  const errorString = 'db error at saveSystemSettings';
  workspace.store.saveSystemSettings = jest.fn(() => {
    throw new Error(errorString);
  });

  mockSystemAdministratorAuth(auth);

  await suppressingConsoleOutput(async () => {
    await expect(
      apiClient.setSystemSettings({ systemSettings: systemSettings.asText() })
    ).rejects.toThrow(errorString);
  });

  // Logger call 1 is made by configureMachine when loading the election definition
  expect(logger.log).toHaveBeenNthCalledWith(
    2,
    LogEventId.SystemSettingsSaveInitiated,
    'system_administrator',
    { disposition: 'na' }
  );
  expect(logger.log).toHaveBeenNthCalledWith(
    3,
    LogEventId.SystemSettingsSaved,
    'system_administrator',
    { disposition: 'failure', error: errorString }
  );
});

test('setSystemSettings returns an error for malformed input', async () => {
  const { apiClient, auth } = buildTestEnvironment();

  const { electionDefinition } = electionMinimalExhaustiveSampleFixtures;
  await configureMachine(apiClient, auth, electionDefinition);

  mockSystemAdministratorAuth(auth);

  const malformedInput = {
    invalidField: 'hello',
  } as const;

  const result = await apiClient.setSystemSettings({
    systemSettings: JSON.stringify(malformedInput),
  });
  assert(result.isErr());
  const err = result.err();
  expect(err.type).toEqual('parsing');
});

test('getSystemSettings happy path', async () => {
  const { apiClient, auth } = buildTestEnvironment();

  const { electionDefinition, systemSettings } =
    electionMinimalExhaustiveSampleFixtures;
  await configureMachine(apiClient, auth, electionDefinition);

  mockSystemAdministratorAuth(auth);

  // configure with well-formed system settings
  const setResult = await apiClient.setSystemSettings({
    systemSettings: systemSettings.asText(),
  });
  assert(setResult.isOk());

  const systemSettingsResult = await apiClient.getSystemSettings();
  assert(systemSettingsResult);
  expect(systemSettingsResult).toEqual(JSON.parse(systemSettings.asText()));
});

test('getSystemSettings returns default system settings when no system settings are found', async () => {
  const { apiClient, auth } = buildTestEnvironment();

  const { electionDefinition } = electionMinimalExhaustiveSampleFixtures;
  await configureMachine(apiClient, auth, electionDefinition);

  mockSystemAdministratorAuth(auth);

  const systemSettingsResult = await apiClient.getSystemSettings();
  expect(systemSettingsResult).toEqual(DEFAULT_SYSTEM_SETTINGS);
});

const manualTallyContestId = 'zoo-council-mammal';
const manualTallyContest = find(
  electionMinimalExhaustiveSampleDefinition.election.contests,
  (c) => c.id === manualTallyContestId
);
function getMockManualTally(
  optionTallies: Dictionary<ContestOptionTally> = {}
): ManualTally {
  return {
    numberOfBallotsCounted: 10,
    contestTallies: {
      [manualTallyContestId]: {
        contest: manualTallyContest,
        tallies: optionTallies,
        metadata: {
          undervotes: 20,
          overvotes: 0,
          ballots: 10,
        },
      },
    },
  };
}

test('manual tally flow', async () => {
  const { apiClient, auth } = buildTestEnvironment();

  const { electionDefinition } = electionMinimalExhaustiveSampleFixtures;
  await configureMachine(apiClient, auth, electionDefinition);

  mockElectionManagerAuth(auth, electionDefinition.electionHash);

  // initial null
  expect(await apiClient.getFullElectionManualTally()).toBeNull();

  const manualTally = getMockManualTally();

  await apiClient.setManualTally({
    precinctId: 'precinct-1',
    manualTally,
  });

  // check results after setting a tally
  const fullElectionManualTally = await apiClient.getFullElectionManualTally();
  expect(fullElectionManualTally?.overallTally).toMatchObject(manualTally);
  expect(
    fullElectionManualTally?.resultsByCategory[TallyCategory.Precinct]?.[
      'precinct-1'
    ]
  ).toMatchObject(manualTally);
  expect(
    fullElectionManualTally?.resultsByCategory[TallyCategory.Precinct]?.[
      'precinct-2'
    ]
  ).toMatchObject({
    numberOfBallotsCounted: 0,
  });

  // delete tallies
  await apiClient.deleteAllManualTallies();
  expect(await apiClient.getFullElectionManualTally()).toBeNull();

  // add tally with a temporary write-in candidate with no votes
  expect(await apiClient.getWriteInCandidates()).toHaveLength(0);
  const manualTallyTempWriteInZeroVotes = getMockManualTally({
    'temp-write-in-(Bob)': {
      tally: 0,
      option: {
        id: 'temp-write-in-(Bob)',
        name: 'Bob',
        isWriteIn: true,
      },
    },
  });
  await apiClient.setManualTally({
    precinctId: 'precinct-1',
    manualTally: manualTallyTempWriteInZeroVotes,
  });
  expect(await apiClient.getWriteInCandidates()).toHaveLength(0);

  // add tally with a temporary write-in candidate with  votes
  const manualTallyTempWriteInWithVotes = getMockManualTally({
    'temp-write-in-(Bob)': {
      tally: 1,
      option: {
        id: 'temp-write-in-(Bob)',
        name: 'Bob',
        isWriteIn: true,
      },
    },
  });
  await apiClient.setManualTally({
    precinctId: 'precinct-1',
    manualTally: manualTallyTempWriteInWithVotes,
  });
  expect(await apiClient.getWriteInCandidates()).toMatchObject([
    { contestId: 'zoo-council-mammal', name: 'Bob' },
  ]);

  // clearing manual results should clear write-in candidate
  await apiClient.deleteAllManualTallies();
  expect(await apiClient.getFullElectionManualTally()).toBeNull();
  expect(await apiClient.getWriteInCandidates()).toHaveLength(0);
});
