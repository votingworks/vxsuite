import { beforeAll, beforeEach, expect, test } from 'vitest';
import { DateTime } from 'luxon';
import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import {
  DEFAULT_SYSTEM_SETTINGS,
  constructElectionKey,
  SystemSettings,
  TEST_JURISDICTION,
} from '@votingworks/types';

import { buildTestEnvironment, configureMachine } from '../test/app';

beforeEach(() => {
  process.env = { ...process.env, VX_MACHINE_JURISDICTION: TEST_JURISDICTION };
});

const jurisdiction = TEST_JURISDICTION;
const machineType = 'admin';
const electionDefinition =
  electionFamousNames2021Fixtures.readElectionDefinition();
const electionKey = constructElectionKey(electionDefinition.election);
const systemSettings: SystemSettings = {
  ...DEFAULT_SYSTEM_SETTINGS,
  auth: {
    arePollWorkerCardPinsEnabled: true,
    inactiveSessionTimeLimitMinutes: 10,
    overallSessionTimeLimitHours: 1,
    numIncorrectPinAttemptsAllowedBeforeCardLockout: 3,
    startingCardLockoutDurationSeconds: 15,
  },
};

beforeAll(() => {
  expect(systemSettings.auth).not.toEqual(DEFAULT_SYSTEM_SETTINGS.auth);
});

test('getAuthStatus', async () => {
  const { apiClient, auth } = buildTestEnvironment();
  await configureMachine(apiClient, auth, electionDefinition, systemSettings);
  auth.getAuthStatus.mockClear(); // Clear mock calls from configureMachine

  await apiClient.getAuthStatus();
  expect(auth.getAuthStatus).toHaveBeenCalledTimes(1);
  expect(auth.getAuthStatus).toHaveBeenNthCalledWith(1, {
    ...systemSettings.auth,
    electionKey,
    jurisdiction,
    machineType,
  });
});

test('checkPin', async () => {
  const { apiClient, auth } = buildTestEnvironment();
  await configureMachine(apiClient, auth, electionDefinition, systemSettings);

  await apiClient.checkPin({ pin: '123456' });
  expect(auth.checkPin).toHaveBeenCalledTimes(1);
  expect(auth.checkPin).toHaveBeenNthCalledWith(
    1,
    { ...systemSettings.auth, electionKey, jurisdiction, machineType },
    { pin: '123456' }
  );
});

test('logOut', async () => {
  const { apiClient, auth } = buildTestEnvironment();
  await configureMachine(apiClient, auth, electionDefinition, systemSettings);

  await apiClient.logOut();
  expect(auth.logOut).toHaveBeenCalledTimes(1);
  expect(auth.logOut).toHaveBeenNthCalledWith(1, {
    ...systemSettings.auth,
    electionKey,
    jurisdiction,
    machineType,
  });
});

test('updateSessionExpiry', async () => {
  const { apiClient, auth } = buildTestEnvironment();
  await configureMachine(apiClient, auth, electionDefinition, systemSettings);

  await apiClient.updateSessionExpiry({
    sessionExpiresAt: DateTime.now().plus({ seconds: 60 }).toJSDate(),
  });
  expect(auth.updateSessionExpiry).toHaveBeenCalledTimes(1);
  expect(auth.updateSessionExpiry).toHaveBeenNthCalledWith(
    1,
    { ...systemSettings.auth, electionKey, jurisdiction, machineType },
    { sessionExpiresAt: expect.any(Date) }
  );
});

test('programCard', async () => {
  const { apiClient, auth } = buildTestEnvironment();
  await configureMachine(apiClient, auth, electionDefinition, systemSettings);

  void (await apiClient.programCard({ userRole: 'system_administrator' }));
  expect(auth.programCard).toHaveBeenCalledTimes(1);
  expect(auth.programCard).toHaveBeenNthCalledWith(
    1,
    { ...systemSettings.auth, electionKey, jurisdiction, machineType },
    { userRole: 'system_administrator' }
  );

  void (await apiClient.programCard({ userRole: 'election_manager' }));
  expect(auth.programCard).toHaveBeenCalledTimes(2);
  expect(auth.programCard).toHaveBeenNthCalledWith(
    2,
    { ...systemSettings.auth, electionKey, jurisdiction, machineType },
    { userRole: 'election_manager' }
  );

  void (await apiClient.programCard({ userRole: 'poll_worker' }));
  expect(auth.programCard).toHaveBeenCalledTimes(3);
  expect(auth.programCard).toHaveBeenNthCalledWith(
    3,
    { ...systemSettings.auth, electionKey, jurisdiction, machineType },
    { userRole: 'poll_worker' }
  );
});

test('unprogramCard', async () => {
  const { apiClient, auth } = buildTestEnvironment();
  await configureMachine(apiClient, auth, electionDefinition, systemSettings);

  void (await apiClient.unprogramCard());
  expect(auth.unprogramCard).toHaveBeenCalledTimes(1);
  expect(auth.unprogramCard).toHaveBeenNthCalledWith(1, {
    ...systemSettings.auth,
    electionKey,
    jurisdiction,
    machineType,
  });
});

test('getAuthStatus before election definition has been configured', async () => {
  const { apiClient, auth } = buildTestEnvironment();

  await apiClient.getAuthStatus();
  expect(auth.getAuthStatus).toHaveBeenCalledTimes(1);
  expect(auth.getAuthStatus).toHaveBeenNthCalledWith(1, {
    ...DEFAULT_SYSTEM_SETTINGS.auth,
    jurisdiction,
    machineType,
  });
});

test('checkPin before election definition has been configured', async () => {
  const { apiClient, auth } = buildTestEnvironment();

  await apiClient.checkPin({ pin: '123456' });
  expect(auth.checkPin).toHaveBeenCalledTimes(1);
  expect(auth.checkPin).toHaveBeenNthCalledWith(
    1,
    {
      ...DEFAULT_SYSTEM_SETTINGS.auth,
      jurisdiction,
      machineType,
    },
    { pin: '123456' }
  );
});

test('logOut before election definition has been configured', async () => {
  const { apiClient, auth } = buildTestEnvironment();

  await apiClient.logOut();
  expect(auth.logOut).toHaveBeenCalledTimes(1);
  expect(auth.logOut).toHaveBeenNthCalledWith(1, {
    ...DEFAULT_SYSTEM_SETTINGS.auth,
    jurisdiction,
    machineType,
  });
});

test('updateSessionExpiry before election definition has been configured', async () => {
  const { apiClient, auth } = buildTestEnvironment();

  await apiClient.updateSessionExpiry({
    sessionExpiresAt: DateTime.now().plus({ seconds: 60 }).toJSDate(),
  });
  expect(auth.updateSessionExpiry).toHaveBeenCalledTimes(1);
  expect(auth.updateSessionExpiry).toHaveBeenNthCalledWith(
    1,
    {
      ...DEFAULT_SYSTEM_SETTINGS.auth,
      jurisdiction,
      machineType,
    },
    { sessionExpiresAt: expect.any(Date) }
  );
});
