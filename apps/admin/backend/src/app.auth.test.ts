import { DateTime } from 'luxon';
import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import {
  DEFAULT_SYSTEM_SETTINGS,
  SystemSettings,
  TEST_JURISDICTION,
} from '@votingworks/types';

import { buildTestEnvironment, configureMachine } from '../test/app';

beforeEach(() => {
  process.env = { ...process.env, VX_MACHINE_JURISDICTION: TEST_JURISDICTION };
});

const jurisdiction = TEST_JURISDICTION;
const { electionDefinition } = electionFamousNames2021Fixtures;
const { electionHash } = electionDefinition;
const systemSettings: SystemSettings = {
  arePollWorkerCardPinsEnabled: true,
  inactiveSessionTimeLimitMinutes: 10,
  overallSessionTimeLimitHours: 1,
  numIncorrectPinAttemptsAllowedBeforeCardLockout: 3,
  startingCardLockoutDurationSeconds: 15,
};

beforeAll(() => {
  expect(systemSettings).not.toEqual(DEFAULT_SYSTEM_SETTINGS);
});

test('getAuthStatus', async () => {
  const { apiClient, auth } = buildTestEnvironment();
  await configureMachine(apiClient, auth, electionDefinition, systemSettings);
  auth.getAuthStatus.mockClear(); // Clear mock calls from configureMachine

  await apiClient.getAuthStatus();
  expect(auth.getAuthStatus).toHaveBeenCalledTimes(1);
  expect(auth.getAuthStatus).toHaveBeenNthCalledWith(1, {
    electionHash,
    jurisdiction,
    ...systemSettings,
  });
});

test('checkPin', async () => {
  const { apiClient, auth } = buildTestEnvironment();
  await configureMachine(apiClient, auth, electionDefinition, systemSettings);

  await apiClient.checkPin({ pin: '123456' });
  expect(auth.checkPin).toHaveBeenCalledTimes(1);
  expect(auth.checkPin).toHaveBeenNthCalledWith(
    1,
    { electionHash, jurisdiction, ...systemSettings },
    { pin: '123456' }
  );
});

test('logOut', async () => {
  const { apiClient, auth } = buildTestEnvironment();
  await configureMachine(apiClient, auth, electionDefinition, systemSettings);

  await apiClient.logOut();
  expect(auth.logOut).toHaveBeenCalledTimes(1);
  expect(auth.logOut).toHaveBeenNthCalledWith(1, {
    electionHash,
    jurisdiction,
    ...systemSettings,
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
    { electionHash, jurisdiction, ...systemSettings },
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
    { electionHash, jurisdiction, ...systemSettings },
    { userRole: 'system_administrator' }
  );

  void (await apiClient.programCard({ userRole: 'election_manager' }));
  expect(auth.programCard).toHaveBeenCalledTimes(2);
  expect(auth.programCard).toHaveBeenNthCalledWith(
    2,
    { electionHash, jurisdiction, ...systemSettings },
    { userRole: 'election_manager' }
  );

  void (await apiClient.programCard({ userRole: 'poll_worker' }));
  expect(auth.programCard).toHaveBeenCalledTimes(3);
  expect(auth.programCard).toHaveBeenNthCalledWith(
    3,
    { electionHash, jurisdiction, ...systemSettings },
    { userRole: 'poll_worker' }
  );
});

test('unprogramCard', async () => {
  const { apiClient, auth } = buildTestEnvironment();
  await configureMachine(apiClient, auth, electionDefinition, systemSettings);

  void (await apiClient.unprogramCard());
  expect(auth.unprogramCard).toHaveBeenCalledTimes(1);
  expect(auth.unprogramCard).toHaveBeenNthCalledWith(1, {
    electionHash,
    jurisdiction,
    ...systemSettings,
  });
});

test('getAuthStatus before election definition has been configured', async () => {
  const { apiClient, auth } = buildTestEnvironment();

  await apiClient.getAuthStatus();
  expect(auth.getAuthStatus).toHaveBeenCalledTimes(1);
  expect(auth.getAuthStatus).toHaveBeenNthCalledWith(1, {
    jurisdiction,
    ...DEFAULT_SYSTEM_SETTINGS,
  });
});

test('checkPin before election definition has been configured', async () => {
  const { apiClient, auth } = buildTestEnvironment();

  await apiClient.checkPin({ pin: '123456' });
  expect(auth.checkPin).toHaveBeenCalledTimes(1);
  expect(auth.checkPin).toHaveBeenNthCalledWith(
    1,
    {
      jurisdiction,
      ...DEFAULT_SYSTEM_SETTINGS,
    },
    { pin: '123456' }
  );
});

test('logOut before election definition has been configured', async () => {
  const { apiClient, auth } = buildTestEnvironment();

  await apiClient.logOut();
  expect(auth.logOut).toHaveBeenCalledTimes(1);
  expect(auth.logOut).toHaveBeenNthCalledWith(1, {
    jurisdiction,
    ...DEFAULT_SYSTEM_SETTINGS,
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
      jurisdiction,
      ...DEFAULT_SYSTEM_SETTINGS,
    },
    { sessionExpiresAt: expect.any(Date) }
  );
});
