import { beforeAll, beforeEach, expect, test, vi } from 'vitest';
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

import { withApp } from '../test/helpers/pdi_helpers';
import { configureApp } from '../test/helpers/shared_helpers';

const jurisdiction = TEST_JURISDICTION;
const machineType = 'scan';
const electionKey = constructElectionKey(
  electionFamousNames2021Fixtures.readElection()
);
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
const electionPackage =
  electionFamousNames2021Fixtures.electionJson.toElectionPackage(
    systemSettings
  );

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
  await withApp(async ({ apiClient, mockAuth, mockUsbDrive }) => {
    await configureApp(apiClient, mockAuth, mockUsbDrive, { electionPackage });
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
});

test('checkPin', async () => {
  await withApp(async ({ apiClient, mockAuth, mockUsbDrive }) => {
    await configureApp(apiClient, mockAuth, mockUsbDrive, { electionPackage });

    await apiClient.checkPin({ pin: '123456' });
    expect(mockAuth.checkPin).toHaveBeenCalledTimes(1);
    expect(mockAuth.checkPin).toHaveBeenNthCalledWith(
      1,
      { ...systemSettings.auth, electionKey, jurisdiction, machineType },
      { pin: '123456' }
    );
  });
});

test('logOut', async () => {
  await withApp(async ({ apiClient, mockAuth, mockUsbDrive }) => {
    await configureApp(apiClient, mockAuth, mockUsbDrive, { electionPackage });

    await apiClient.logOut();
    expect(mockAuth.logOut).toHaveBeenCalledTimes(1);
    expect(mockAuth.logOut).toHaveBeenNthCalledWith(1, {
      ...systemSettings.auth,
      electionKey,
      jurisdiction,
      machineType,
    });
  });
});

test('updateSessionExpiry', async () => {
  await withApp(async ({ apiClient, mockAuth, mockUsbDrive }) => {
    await configureApp(apiClient, mockAuth, mockUsbDrive, { electionPackage });

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
});

test('getAuthStatus before election definition has been configured', async () => {
  await withApp(async ({ apiClient, mockAuth }) => {
    vi.mocked(mockAuth.getAuthStatus).mockClear(); // Clear mock calls from state machine
    await apiClient.getAuthStatus();
    expect(mockAuth.getAuthStatus).toHaveBeenCalledTimes(1);
    expect(mockAuth.getAuthStatus).toHaveBeenNthCalledWith(1, {
      ...DEFAULT_SYSTEM_SETTINGS.auth,
      machineType,
    });
  });
});

test('checkPin before election definition has been configured', async () => {
  await withApp(async ({ apiClient, mockAuth }) => {
    await apiClient.checkPin({ pin: '123456' });
    expect(mockAuth.checkPin).toHaveBeenCalledTimes(1);
    expect(mockAuth.checkPin).toHaveBeenNthCalledWith(
      1,
      { ...DEFAULT_SYSTEM_SETTINGS.auth, machineType },
      { pin: '123456' }
    );
  });
});

test('logOut before election definition has been configured', async () => {
  await withApp(async ({ apiClient, mockAuth }) => {
    await apiClient.logOut();
    expect(mockAuth.logOut).toHaveBeenCalledTimes(1);
    expect(mockAuth.logOut).toHaveBeenNthCalledWith(1, {
      ...DEFAULT_SYSTEM_SETTINGS.auth,
      machineType,
    });
  });
});

test('updateSessionExpiry before election definition has been configured', async () => {
  await withApp(async ({ apiClient, mockAuth }) => {
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
});
