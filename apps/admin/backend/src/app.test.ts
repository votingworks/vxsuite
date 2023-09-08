import { assert, err, ok } from '@votingworks/basics';
import {
  electionTwoPartyPrimaryFixtures,
  electionGeneral,
} from '@votingworks/fixtures';
import { LogEventId } from '@votingworks/logging';

import {
  convertVxfElectionToCdfBallotDefinition,
  DEFAULT_SYSTEM_SETTINGS,
  safeParseElectionDefinition,
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

  // try configuring with malformed election data
  const badConfigureResult = await apiClient.configure({
    electionData: '{}',
    systemSettingsData: JSON.stringify(DEFAULT_SYSTEM_SETTINGS),
  });
  assert(badConfigureResult.isErr());
  expect(badConfigureResult.err().type).toEqual('invalidElection');

  const { electionDefinition } = electionTwoPartyPrimaryFixtures;
  const { electionData, electionHash } = electionDefinition;

  // try configuring with malformed system settings data
  const badSystemSettingsConfigureResult = await apiClient.configure({
    electionData,
    systemSettingsData: '{}',
  });
  assert(badSystemSettingsConfigureResult.isErr());
  expect(badSystemSettingsConfigureResult.err().type).toEqual(
    'invalidSystemSettings'
  );

  // configure with well-formed data
  const configureResult = await apiClient.configure({
    electionData,
    systemSettingsData: JSON.stringify(DEFAULT_SYSTEM_SETTINGS),
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
    systemSettingsData: JSON.stringify(DEFAULT_SYSTEM_SETTINGS),
  }));
  expect(await apiClient.getCurrentElectionMetadata()).toMatchObject({
    isOfficialResults: false,
    electionDefinition,
  });
});

test('configuring with a CDF election', async () => {
  const { apiClient, auth, logger } = buildTestEnvironment();

  mockSystemAdministratorAuth(auth);

  const { electionData, electionHash } = safeParseElectionDefinition(
    JSON.stringify(convertVxfElectionToCdfBallotDefinition(electionGeneral))
  ).unsafeUnwrap();

  // configure with well-formed election data
  const configureResult = await apiClient.configure({
    electionData,
    systemSettingsData: JSON.stringify(DEFAULT_SYSTEM_SETTINGS),
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

test('getSystemSettings happy path', async () => {
  const { apiClient, auth } = buildTestEnvironment();

  const { electionDefinition, systemSettings } =
    electionTwoPartyPrimaryFixtures;
  await configureMachine(
    apiClient,
    auth,
    electionDefinition,
    JSON.parse(systemSettings.asText())
  );

  mockSystemAdministratorAuth(auth);

  const systemSettingsResult = await apiClient.getSystemSettings();
  assert(systemSettingsResult);
  expect(systemSettingsResult).toEqual(JSON.parse(systemSettings.asText()));
});

test('getSystemSettings returns default system settings when there is no current election', async () => {
  const { apiClient } = buildTestEnvironment();

  const systemSettingsResult = await apiClient.getSystemSettings();
  expect(systemSettingsResult).toEqual(DEFAULT_SYSTEM_SETTINGS);
});

test('saveBallotPackageToUsb', async () => {
  const { apiClient, auth, mockUsb } = buildTestEnvironment();
  const { electionDefinition } = electionTwoPartyPrimaryFixtures;
  await configureMachine(apiClient, auth, electionDefinition);

  mockUsb.insertUsbDrive({});
  const response = await apiClient.saveBallotPackageToUsb();
  expect(response).toEqual(ok());
});

test('saveBallotPackageToUsb when no USB drive', async () => {
  const { apiClient, auth } = buildTestEnvironment();
  const { electionDefinition } = electionTwoPartyPrimaryFixtures;
  await configureMachine(apiClient, auth, electionDefinition);

  const response = await apiClient.saveBallotPackageToUsb();
  expect(response).toEqual(
    err({ type: 'missing-usb-drive', message: 'No USB drive found' })
  );
});
