import { afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import { DateTime } from 'luxon';
import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import {
  DEFAULT_SYSTEM_SETTINGS,
  constructElectionKey,
  SystemSettings,
  TEST_JURISDICTION,
  BallotStyleId,
} from '@votingworks/types';
import * as grout from '@votingworks/grout';

import { InsertedSmartCardAuthApi } from '@votingworks/auth';
import { Server } from 'node:http';
import {
  BooleanEnvironmentVariableName,
  getFeatureFlagMock,
} from '@votingworks/utils';

import { MockUsbDrive } from '@votingworks/usb-drive';
import { configureApp, createApp } from '../test/app_helpers';
import { Api } from './app';
import { PaperHandlerStateMachine } from './custom-paper-handler';

const jurisdiction = TEST_JURISDICTION;
const machineType = 'mark-scan';
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

const mockFeatureFlagger = getFeatureFlagMock();

vi.mock(import('@votingworks/utils'), async (importActual) => ({
  ...(await importActual()),
  isFeatureFlagEnabled: (flag) => mockFeatureFlagger.isEnabled(flag),
}));

let apiClient: grout.Client<Api>;
let mockAuth: InsertedSmartCardAuthApi;
let mockUsbDrive: MockUsbDrive;
let server: Server;
let stateMachine: PaperHandlerStateMachine;

beforeAll(() => {
  expect(systemSettings.auth).not.toEqual(DEFAULT_SYSTEM_SETTINGS.auth);
});

beforeEach(async () => {
  mockFeatureFlagger.enableFeatureFlag(
    BooleanEnvironmentVariableName.SKIP_ELECTION_PACKAGE_AUTHENTICATION
  );

  const result = await createApp();
  apiClient = result.apiClient;
  mockAuth = result.mockAuth;
  mockUsbDrive = result.mockUsbDrive;
  server = result.server;
  stateMachine = result.stateMachine;
});

afterEach(async () => {
  await stateMachine.cleanUp();
  server?.close();
});

test('getAuthStatus', async () => {
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
  vi.spyOn(stateMachine, 'reset');

  await configureApp(apiClient, mockAuth, mockUsbDrive, systemSettings);

  await apiClient.endCardlessVoterSession();
  expect(mockAuth.endCardlessVoterSession).toHaveBeenCalledTimes(1);
  expect(mockAuth.endCardlessVoterSession).toHaveBeenNthCalledWith(1, {
    ...systemSettings.auth,
    electionKey,
    jurisdiction,
    machineType,
  });
  expect(stateMachine.reset).toHaveBeenCalled();
});

test('getAuthStatus before election definition has been configured', async () => {
  await apiClient.getAuthStatus();

  // Additional call expected from the state machine:
  expect(mockAuth.getAuthStatus).toHaveBeenCalledTimes(2);
  expect(mockAuth.getAuthStatus).toHaveBeenNthCalledWith(1, {
    ...DEFAULT_SYSTEM_SETTINGS.auth,
    machineType,
  });
});

test('checkPin before election definition has been configured', async () => {
  await apiClient.checkPin({ pin: '123456' });
  expect(mockAuth.checkPin).toHaveBeenCalledTimes(1);
  expect(mockAuth.checkPin).toHaveBeenNthCalledWith(
    1,
    { ...DEFAULT_SYSTEM_SETTINGS.auth, machineType },
    { pin: '123456' }
  );
});

test('logOut before election definition has been configured', async () => {
  await apiClient.logOut();
  expect(mockAuth.logOut).toHaveBeenCalledTimes(1);
  expect(mockAuth.logOut).toHaveBeenNthCalledWith(1, {
    ...DEFAULT_SYSTEM_SETTINGS.auth,
    machineType,
  });
});

test('updateSessionExpiry before election definition has been configured', async () => {
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
  await apiClient.endCardlessVoterSession();
  expect(mockAuth.endCardlessVoterSession).toHaveBeenCalledTimes(1);
  expect(mockAuth.endCardlessVoterSession).toHaveBeenNthCalledWith(1, {
    ...DEFAULT_SYSTEM_SETTINGS.auth,
    machineType,
  });
});

test('updateCardlessVoterBallotStyle', async () => {
  await apiClient.updateCardlessVoterBallotStyle({
    ballotStyleId: '2_es-US' as BallotStyleId,
  });

  expect(mockAuth.updateCardlessVoterBallotStyle).toHaveBeenCalledTimes(1);
  expect(mockAuth.updateCardlessVoterBallotStyle).toHaveBeenLastCalledWith({
    ballotStyleId: '2_es-US' as BallotStyleId,
  });
});
