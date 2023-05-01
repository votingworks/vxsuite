import { assert } from '@votingworks/basics';
import {
  electionMinimalExhaustiveSampleFixtures,
  electionSampleCdfDefinition,
} from '@votingworks/fixtures';
import { LogEventId } from '@votingworks/logging';

import { suppressingConsoleOutput } from '@votingworks/test-utils';
import { DEFAULT_SYSTEM_SETTINGS } from '@votingworks/types';
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
  expect(systemSettingsResult).toEqual(DEFAULT_SYSTEM_SETTINGS);
});

test('getSystemSettings returns null when no `system settings` are found', async () => {
  const { apiClient, auth } = buildTestEnvironment();

  const { electionDefinition } = electionMinimalExhaustiveSampleFixtures;
  await configureMachine(apiClient, auth, electionDefinition);

  mockSystemAdministratorAuth(auth);

  const systemSettingsResult = await apiClient.getSystemSettings();
  expect(systemSettingsResult).toBeNull();
});
