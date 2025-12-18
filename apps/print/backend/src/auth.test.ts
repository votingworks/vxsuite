import { afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import { Server } from 'node:http';
import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import {
  constructElectionKey,
  DEFAULT_SYSTEM_SETTINGS,
  SystemSettings,
  TEST_JURISDICTION,
} from '@votingworks/types';
import {
  BooleanEnvironmentVariableName,
  getFeatureFlagMock,
  singlePrecinctSelectionFor,
} from '@votingworks/utils';

import { buildTestEnvironment, configureFromUsb } from '../test/app';

const jurisdiction = TEST_JURISDICTION;
const machineType = 'print';
const electionDefinition =
  electionFamousNames2021Fixtures.readElectionDefinition();
const electionKey = constructElectionKey(electionDefinition.election);

const systemSettingsForAuthTests: SystemSettings = {
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
  expect(systemSettingsForAuthTests.auth).not.toEqual(
    DEFAULT_SYSTEM_SETTINGS.auth
  );
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

let server: Server | undefined;

afterEach(() => {
  server?.close();
  server = undefined;
});

test('getAuthStatus', async () => {
  const env = buildTestEnvironment();
  server = env.server;
  const { apiClient, auth, mockUsbDrive, workspace } = env;

  await configureFromUsb(apiClient, auth, mockUsbDrive, {
    electionDefinition,
    systemSettings: systemSettingsForAuthTests,
  });

  // check that auth.getAuthStatus is called with isConfigured: false

  // Ensure machine is configured (print requires precinct selection).
  if (!workspace.store.getPrecinctSelection()) {
    workspace.store.setPrecinctSelection(
      singlePrecinctSelectionFor(electionDefinition.election.precincts[0]!.id)
    );
  }

  vi.mocked(auth.getAuthStatus).mockClear(); // Clear mock calls from configureFromUsb

  await apiClient.getAuthStatus();
  expect(auth.getAuthStatus).toHaveBeenCalledTimes(1);
  expect(auth.getAuthStatus).toHaveBeenNthCalledWith(1, {
    ...systemSettingsForAuthTests.auth,
    electionKey,
    jurisdiction,
    machineType,
    isConfigured: true,
  });
});

test('checkPin', async () => {
  const env = buildTestEnvironment();
  server = env.server;
  const { apiClient, auth, mockUsbDrive, workspace } = env;

  await configureFromUsb(apiClient, auth, mockUsbDrive, {
    electionDefinition,
    systemSettings: systemSettingsForAuthTests,
  });

  if (!workspace.store.getPrecinctSelection()) {
    workspace.store.setPrecinctSelection(
      singlePrecinctSelectionFor(electionDefinition.election.precincts[0]!.id)
    );
  }

  await apiClient.checkPin({ pin: '123456' });
  expect(auth.checkPin).toHaveBeenCalledTimes(1);
  expect(auth.checkPin).toHaveBeenNthCalledWith(
    1,
    {
      ...systemSettingsForAuthTests.auth,
      electionKey,
      jurisdiction,
      machineType,
      isConfigured: true,
    },
    { pin: '123456' }
  );
});

test('logOut', async () => {
  const env = buildTestEnvironment();
  server = env.server;
  const { apiClient, auth, mockUsbDrive, workspace } = env;

  await configureFromUsb(apiClient, auth, mockUsbDrive, {
    electionDefinition,
    systemSettings: systemSettingsForAuthTests,
  });

  if (!workspace.store.getPrecinctSelection()) {
    workspace.store.setPrecinctSelection(
      singlePrecinctSelectionFor(electionDefinition.election.precincts[0]!.id)
    );
  }

  await apiClient.logOut();
  expect(auth.logOut).toHaveBeenCalledTimes(1);
  expect(auth.logOut).toHaveBeenNthCalledWith(1, {
    ...systemSettingsForAuthTests.auth,
    electionKey,
    jurisdiction,
    machineType,
    isConfigured: true,
  });
});
