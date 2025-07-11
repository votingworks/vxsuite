import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { DateTime } from 'luxon';
import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import {
  DEFAULT_SYSTEM_SETTINGS,
  constructElectionKey,
  SystemSettings,
  TEST_JURISDICTION,
  BallotStyleId,
  SignedHashValidationQrCodeValue,
} from '@votingworks/types';
import {
  BooleanEnvironmentVariableName,
  getFeatureFlagMock,
} from '@votingworks/utils';
import { generateSignedHashValidationQrCodeValue } from '@votingworks/auth';
import { LogEventId } from '@votingworks/logging';
import { configureApp, createApp } from '../test/app_helpers';

vi.mock('@votingworks/auth', async (importActual) => ({
  ...(await importActual()),
  generateSignedHashValidationQrCodeValue: vi.fn(),
}));

const jurisdiction = TEST_JURISDICTION;
const machineType = 'mark';
const election = electionFamousNames2021Fixtures.readElection();
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

vi.mock(import('@votingworks/utils'), async (importActual) => ({
  ...(await importActual()),
  isFeatureFlagEnabled: (flag) => mockFeatureFlagger.isEnabled(flag),
}));

beforeEach(() => {
  mockFeatureFlagger.enableFeatureFlag(
    BooleanEnvironmentVariableName.SKIP_ELECTION_PACKAGE_AUTHENTICATION
  );
});

test('getAuthStatus', async () => {
  const { apiClient, mockAuth, mockUsbDrive } = createApp();
  await configureApp(apiClient, mockAuth, mockUsbDrive, systemSettings);
  vi.mocked(mockAuth.getAuthStatus).mockClear(); // Clear mock calls from configureApp

  await apiClient.getAuthStatus();
  expect(mockAuth.getAuthStatus).toHaveBeenCalledTimes(1);
  expect(mockAuth.getAuthStatus).toHaveBeenNthCalledWith(1, {
    ...systemSettings.auth,
    electionKey,
    jurisdiction,
    machineType,
  });
});

test('checkPin', async () => {
  const { apiClient, mockAuth, mockUsbDrive } = createApp();
  await configureApp(apiClient, mockAuth, mockUsbDrive, systemSettings);

  await apiClient.checkPin({ pin: '123456' });
  expect(mockAuth.checkPin).toHaveBeenCalledTimes(1);
  expect(mockAuth.checkPin).toHaveBeenNthCalledWith(
    1,
    { ...systemSettings.auth, electionKey, jurisdiction, machineType },
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
    machineType,
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
    { ...systemSettings.auth, electionKey, jurisdiction, machineType },
    { sessionExpiresAt: expect.any(Date) }
  );
});

test('startCardlessVoterSession', async () => {
  const { apiClient, mockAuth, mockUsbDrive } = createApp();
  await configureApp(apiClient, mockAuth, mockUsbDrive, systemSettings);

  await apiClient.startCardlessVoterSession({
    ballotStyleId: 'b1' as BallotStyleId,
    precinctId: 'p1',
  });
  expect(mockAuth.startCardlessVoterSession).toHaveBeenCalledTimes(1);
  expect(mockAuth.startCardlessVoterSession).toHaveBeenNthCalledWith(
    1,
    { ...systemSettings.auth, electionKey, jurisdiction, machineType },
    { ballotStyleId: 'b1' as BallotStyleId, precinctId: 'p1' }
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
    machineType,
  });
});

test('getAuthStatus before election definition has been configured', async () => {
  const { apiClient, mockAuth } = createApp();

  await apiClient.getAuthStatus();
  expect(mockAuth.getAuthStatus).toHaveBeenCalledTimes(1);
  expect(mockAuth.getAuthStatus).toHaveBeenNthCalledWith(1, {
    ...DEFAULT_SYSTEM_SETTINGS.auth,
    machineType,
  });
});

test('checkPin before election definition has been configured', async () => {
  const { apiClient, mockAuth } = createApp();

  await apiClient.checkPin({ pin: '123456' });
  expect(mockAuth.checkPin).toHaveBeenCalledTimes(1);
  expect(mockAuth.checkPin).toHaveBeenNthCalledWith(
    1,
    { ...DEFAULT_SYSTEM_SETTINGS.auth, machineType },
    { pin: '123456' }
  );
});

test('logOut before election definition has been configured', async () => {
  const { apiClient, mockAuth } = createApp();

  await apiClient.logOut();
  expect(mockAuth.logOut).toHaveBeenCalledTimes(1);
  expect(mockAuth.logOut).toHaveBeenNthCalledWith(1, {
    ...DEFAULT_SYSTEM_SETTINGS.auth,
    machineType,
  });
});

test('updateSessionExpiry before election definition has been configured', async () => {
  const { apiClient, mockAuth } = createApp();

  await apiClient.updateSessionExpiry({
    sessionExpiresAt: DateTime.now().plus({ seconds: 60 }).toJSDate(),
  });
  expect(mockAuth.updateSessionExpiry).toHaveBeenCalledTimes(1);
  expect(mockAuth.updateSessionExpiry).toHaveBeenNthCalledWith(
    1,
    { ...DEFAULT_SYSTEM_SETTINGS.auth, machineType },
    { sessionExpiresAt: expect.any(Date) }
  );
});

test('startCardlessVoterSession before election definition has been configured', async () => {
  const { apiClient, mockAuth } = createApp();

  await apiClient.startCardlessVoterSession({
    ballotStyleId: 'b1' as BallotStyleId,
    precinctId: 'p1',
  });
  expect(mockAuth.startCardlessVoterSession).toHaveBeenCalledTimes(1);
  expect(mockAuth.startCardlessVoterSession).toHaveBeenNthCalledWith(
    1,
    { ...DEFAULT_SYSTEM_SETTINGS.auth, machineType },
    { ballotStyleId: 'b1' as BallotStyleId, precinctId: 'p1' }
  );
});

test('endCardlessVoterSession before election definition has been configured', async () => {
  const { apiClient, mockAuth } = createApp();

  await apiClient.endCardlessVoterSession();
  expect(mockAuth.endCardlessVoterSession).toHaveBeenCalledTimes(1);
  expect(mockAuth.endCardlessVoterSession).toHaveBeenNthCalledWith(1, {
    ...DEFAULT_SYSTEM_SETTINGS.auth,
    machineType,
  });
});

test('updateCardlessVoterBallotStyle', async () => {
  const { apiClient, mockAuth, mockUsbDrive } = createApp();
  await configureApp(apiClient, mockAuth, mockUsbDrive, systemSettings);

  await apiClient.updateCardlessVoterBallotStyle({
    ballotStyleId: '2_es-US' as BallotStyleId,
  });

  expect(mockAuth.updateCardlessVoterBallotStyle).toHaveBeenCalledTimes(1);
  expect(mockAuth.updateCardlessVoterBallotStyle).toHaveBeenLastCalledWith({
    ballotStyleId: '2_es-US' as BallotStyleId,
  });
});

describe('generateSignedHashValidationQrCodeValue', () => {
  test('pass', async () => {
    const { apiClient, logger, mockAuth, mockUsbDrive } = createApp();
    await configureApp(apiClient, mockAuth, mockUsbDrive, systemSettings);

    const mockLogger = vi.mocked(logger.logAsCurrentRole);
    mockLogger.mockReset();

    vi.mocked(generateSignedHashValidationQrCodeValue).mockResolvedValueOnce({
      qrCodeValue: 'qr code',
    } as unknown as SignedHashValidationQrCodeValue);

    const result = await apiClient.generateSignedHashValidationQrCodeValue();
    expect(result).toEqual({ qrCodeValue: 'qr code' });

    expect(mockLogger.mock.calls).toEqual([
      [LogEventId.SignedHashValidationInit],
      [LogEventId.SignedHashValidationComplete, { disposition: 'success' }],
    ]);
  });

  test('fail', async () => {
    const { apiClient, logger, mockAuth, mockUsbDrive } = createApp();
    await configureApp(apiClient, mockAuth, mockUsbDrive, systemSettings);

    const mockLogger = vi.mocked(logger.logAsCurrentRole);
    mockLogger.mockReset();

    vi.mocked(generateSignedHashValidationQrCodeValue).mockRejectedValueOnce(
      new Error('oops')
    );

    await expect(
      apiClient.generateSignedHashValidationQrCodeValue
    ).rejects.toThrow();

    expect(mockLogger.mock.calls).toEqual([
      [LogEventId.SignedHashValidationInit],
      [
        LogEventId.SignedHashValidationComplete,
        { disposition: 'failure', message: expect.stringContaining('oops') },
      ],
    ]);
  });
});
