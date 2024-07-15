import { DateTime } from 'luxon';
import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import {
  DEFAULT_SYSTEM_SETTINGS,
  constructElectionKey,
  SystemSettings,
  TEST_JURISDICTION,
} from '@votingworks/types';
import {
  BooleanEnvironmentVariableName,
  getFeatureFlagMock,
} from '@votingworks/utils';
import { mockOf } from '@votingworks/test-utils';
import { configureApp, createApp } from '../test/app_helpers';

const jurisdiction = TEST_JURISDICTION;
const { election } = electionFamousNames2021Fixtures;
const electionKey = constructElectionKey(election);
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

const mockFeatureFlagger = getFeatureFlagMock();

jest.mock('@votingworks/utils', (): typeof import('@votingworks/utils') => {
  return {
    ...jest.requireActual('@votingworks/utils'),
    isFeatureFlagEnabled: (flag) => mockFeatureFlagger.isEnabled(flag),
  };
});

beforeEach(() => {
  mockFeatureFlagger.enableFeatureFlag(
    BooleanEnvironmentVariableName.SKIP_ELECTION_PACKAGE_AUTHENTICATION
  );
});

test('getAuthStatus', async () => {
  const { apiClient, mockAuth, mockUsbDrive } = createApp();
  await configureApp(apiClient, mockAuth, mockUsbDrive, systemSettings);
  mockOf(mockAuth.getAuthStatus).mockClear(); // Clear mock calls from configureApp

  await apiClient.getAuthStatus();
  expect(mockAuth.getAuthStatus).toHaveBeenCalledTimes(1);
  expect(mockAuth.getAuthStatus).toHaveBeenNthCalledWith(1, {
    ...systemSettings.auth,
    electionKey,
    jurisdiction,
  });
});

test('checkPin', async () => {
  const { apiClient, mockAuth, mockUsbDrive } = createApp();
  await configureApp(apiClient, mockAuth, mockUsbDrive, systemSettings);

  await apiClient.checkPin({ pin: '123456' });
  expect(mockAuth.checkPin).toHaveBeenCalledTimes(1);
  expect(mockAuth.checkPin).toHaveBeenNthCalledWith(
    1,
    { ...systemSettings.auth, electionKey, jurisdiction },
    { pin: '123456' }
  );
});

test('logOut', async () => {
  const { apiClient, mockAuth, mockUsbDrive } = createApp();
  await configureApp(apiClient, mockAuth, mockUsbDrive, systemSettings);

  await apiClient.logOut();
  expect(mockAuth.logOut).toHaveBeenCalledTimes(1);
  expect(mockAuth.logOut).toHaveBeenNthCalledWith(1, {
    ...systemSettings.auth,
    electionKey,
    jurisdiction,
  });
});

test('updateSessionExpiry', async () => {
  const { apiClient, mockAuth, mockUsbDrive } = createApp();
  await configureApp(apiClient, mockAuth, mockUsbDrive, systemSettings);

  await apiClient.updateSessionExpiry({
    sessionExpiresAt: DateTime.now().plus({ seconds: 60 }).toJSDate(),
  });
  expect(mockAuth.updateSessionExpiry).toHaveBeenCalledTimes(1);
  expect(mockAuth.updateSessionExpiry).toHaveBeenNthCalledWith(
    1,
    { ...systemSettings.auth, electionKey, jurisdiction },
    { sessionExpiresAt: expect.any(Date) }
  );
});

test('startCardlessVoterSession', async () => {
  const { apiClient, mockAuth, mockUsbDrive } = createApp();
  await configureApp(apiClient, mockAuth, mockUsbDrive, systemSettings);

  await apiClient.startCardlessVoterSession({
    ballotStyleId: 'b1',
    precinctId: 'p1',
  });
  expect(mockAuth.startCardlessVoterSession).toHaveBeenCalledTimes(1);
  expect(mockAuth.startCardlessVoterSession).toHaveBeenNthCalledWith(
    1,
    { ...systemSettings.auth, electionKey, jurisdiction },
    { ballotStyleId: 'b1', precinctId: 'p1' }
  );
});

test('endCardlessVoterSession', async () => {
  const { apiClient, mockAuth, mockUsbDrive } = createApp();
  await configureApp(apiClient, mockAuth, mockUsbDrive, systemSettings);

  await apiClient.endCardlessVoterSession();
  expect(mockAuth.endCardlessVoterSession).toHaveBeenCalledTimes(1);
  expect(mockAuth.endCardlessVoterSession).toHaveBeenNthCalledWith(1, {
    ...systemSettings.auth,
    electionKey,
    jurisdiction,
  });
});

test('getAuthStatus before election definition has been configured', async () => {
  const { apiClient, mockAuth } = createApp();

  await apiClient.getAuthStatus();
  expect(mockAuth.getAuthStatus).toHaveBeenCalledTimes(1);
  expect(mockAuth.getAuthStatus).toHaveBeenNthCalledWith(
    1,
    DEFAULT_SYSTEM_SETTINGS.auth
  );
});

test('checkPin before election definition has been configured', async () => {
  const { apiClient, mockAuth } = createApp();

  await apiClient.checkPin({ pin: '123456' });
  expect(mockAuth.checkPin).toHaveBeenCalledTimes(1);
  expect(mockAuth.checkPin).toHaveBeenNthCalledWith(
    1,
    DEFAULT_SYSTEM_SETTINGS.auth,
    { pin: '123456' }
  );
});

test('logOut before election definition has been configured', async () => {
  const { apiClient, mockAuth } = createApp();

  await apiClient.logOut();
  expect(mockAuth.logOut).toHaveBeenCalledTimes(1);
  expect(mockAuth.logOut).toHaveBeenNthCalledWith(
    1,
    DEFAULT_SYSTEM_SETTINGS.auth
  );
});

test('updateSessionExpiry before election definition has been configured', async () => {
  const { apiClient, mockAuth } = createApp();

  await apiClient.updateSessionExpiry({
    sessionExpiresAt: DateTime.now().plus({ seconds: 60 }).toJSDate(),
  });
  expect(mockAuth.updateSessionExpiry).toHaveBeenCalledTimes(1);
  expect(mockAuth.updateSessionExpiry).toHaveBeenNthCalledWith(
    1,
    DEFAULT_SYSTEM_SETTINGS.auth,
    { sessionExpiresAt: expect.any(Date) }
  );
});

test('startCardlessVoterSession before election definition has been configured', async () => {
  const { apiClient, mockAuth } = createApp();

  await apiClient.startCardlessVoterSession({
    ballotStyleId: 'b1',
    precinctId: 'p1',
  });
  expect(mockAuth.startCardlessVoterSession).toHaveBeenCalledTimes(1);
  expect(mockAuth.startCardlessVoterSession).toHaveBeenNthCalledWith(
    1,
    DEFAULT_SYSTEM_SETTINGS.auth,
    { ballotStyleId: 'b1', precinctId: 'p1' }
  );
});

test('endCardlessVoterSession before election definition has been configured', async () => {
  const { apiClient, mockAuth } = createApp();

  await apiClient.endCardlessVoterSession();
  expect(mockAuth.endCardlessVoterSession).toHaveBeenCalledTimes(1);
  expect(mockAuth.endCardlessVoterSession).toHaveBeenNthCalledWith(
    1,
    DEFAULT_SYSTEM_SETTINGS.auth
  );
});

test('updateCardlessVoterBallotStyle', async () => {
  const { apiClient, mockAuth, mockUsbDrive } = createApp();
  await configureApp(apiClient, mockAuth, mockUsbDrive, systemSettings);

  await apiClient.updateCardlessVoterBallotStyle({ ballotStyleId: '2_es-US' });

  expect(mockAuth.updateCardlessVoterBallotStyle).toHaveBeenCalledTimes(1);
  expect(mockAuth.updateCardlessVoterBallotStyle).toHaveBeenLastCalledWith({
    ballotStyleId: '2_es-US',
  });
});
