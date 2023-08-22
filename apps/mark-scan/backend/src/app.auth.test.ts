import { DateTime } from 'luxon';
import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import {
  DEFAULT_SYSTEM_SETTINGS,
  SystemSettings,
  TEST_JURISDICTION,
} from '@votingworks/types';
import * as grout from '@votingworks/grout';

import { InsertedSmartCardAuthApi } from '@votingworks/auth';
import { MockUsb } from '@votingworks/backend';
import { Server } from 'http';
import { mockOf } from '@votingworks/test-utils';
import { configureApp, createApp } from '../test/app_helpers';
import { Api } from './app';
import { PaperHandlerStateMachine } from './custom-paper-handler';

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

let apiClient: grout.Client<Api>;
let mockAuth: InsertedSmartCardAuthApi;
let mockUsb: MockUsb;
let server: Server;
let stateMachine: PaperHandlerStateMachine;

beforeAll(() => {
  expect(systemSettings).not.toEqual(DEFAULT_SYSTEM_SETTINGS);
});

beforeEach(async () => {
  const result = await createApp();
  apiClient = result.apiClient;
  mockAuth = result.mockAuth;
  mockUsb = result.mockUsb;
  server = result.server;
  stateMachine = result.stateMachine;
});

afterEach(() => {
  stateMachine.stopMachineService();
  server?.close();
});

test('getAuthStatus', async () => {
  await configureApp(apiClient, mockAuth, mockUsb, systemSettings);
  mockOf(mockAuth.getAuthStatus).mockClear(); // Clear mock calls from configureApp

  await apiClient.getAuthStatus();
  expect(mockAuth.getAuthStatus).toHaveBeenCalledTimes(1);
  expect(mockAuth.getAuthStatus).toHaveBeenNthCalledWith(1, {
    ...systemSettings,
    electionHash,
    jurisdiction,
  });
});

test('checkPin', async () => {
  await configureApp(apiClient, mockAuth, mockUsb, systemSettings);

  await apiClient.checkPin({ pin: '123456' });
  expect(mockAuth.checkPin).toHaveBeenCalledTimes(1);
  expect(mockAuth.checkPin).toHaveBeenNthCalledWith(
    1,
    { ...systemSettings, electionHash, jurisdiction },
    { pin: '123456' }
  );
});

test('logOut', async () => {
  await configureApp(apiClient, mockAuth, mockUsb, systemSettings);

  await apiClient.logOut();
  expect(mockAuth.logOut).toHaveBeenCalledTimes(1);
  expect(mockAuth.logOut).toHaveBeenNthCalledWith(1, {
    ...systemSettings,
    electionHash,
    jurisdiction,
  });
});

test('updateSessionExpiry', async () => {
  await configureApp(apiClient, mockAuth, mockUsb, systemSettings);

  await apiClient.updateSessionExpiry({
    sessionExpiresAt: DateTime.now().plus({ seconds: 60 }).toJSDate(),
  });
  expect(mockAuth.updateSessionExpiry).toHaveBeenCalledTimes(1);
  expect(mockAuth.updateSessionExpiry).toHaveBeenNthCalledWith(
    1,
    { ...systemSettings, electionHash, jurisdiction },
    { sessionExpiresAt: expect.any(Date) }
  );
});

test('startCardlessVoterSession', async () => {
  await configureApp(apiClient, mockAuth, mockUsb, systemSettings);

  await apiClient.startCardlessVoterSession({
    ballotStyleId: 'b1',
    precinctId: 'p1',
  });
  expect(mockAuth.startCardlessVoterSession).toHaveBeenCalledTimes(1);
  expect(mockAuth.startCardlessVoterSession).toHaveBeenNthCalledWith(
    1,
    { ...systemSettings, electionHash, jurisdiction },
    { ballotStyleId: 'b1', precinctId: 'p1' }
  );
});

test('endCardlessVoterSession', async () => {
  await configureApp(apiClient, mockAuth, mockUsb, systemSettings);

  await apiClient.endCardlessVoterSession();
  expect(mockAuth.endCardlessVoterSession).toHaveBeenCalledTimes(1);
  expect(mockAuth.endCardlessVoterSession).toHaveBeenNthCalledWith(1, {
    ...systemSettings,
    electionHash,
    jurisdiction,
  });
});

test('getAuthStatus before election definition has been configured', async () => {
  await apiClient.getAuthStatus();
  expect(mockAuth.getAuthStatus).toHaveBeenCalledTimes(1);
  expect(mockAuth.getAuthStatus).toHaveBeenNthCalledWith(
    1,
    DEFAULT_SYSTEM_SETTINGS
  );
});

test('checkPin before election definition has been configured', async () => {
  await apiClient.checkPin({ pin: '123456' });
  expect(mockAuth.checkPin).toHaveBeenCalledTimes(1);
  expect(mockAuth.checkPin).toHaveBeenNthCalledWith(
    1,
    DEFAULT_SYSTEM_SETTINGS,
    { pin: '123456' }
  );
});

test('logOut before election definition has been configured', async () => {
  await apiClient.logOut();
  expect(mockAuth.logOut).toHaveBeenCalledTimes(1);
  expect(mockAuth.logOut).toHaveBeenNthCalledWith(1, DEFAULT_SYSTEM_SETTINGS);
});

test('updateSessionExpiry before election definition has been configured', async () => {
  await apiClient.updateSessionExpiry({
    sessionExpiresAt: DateTime.now().plus({ seconds: 60 }).toJSDate(),
  });
  expect(mockAuth.updateSessionExpiry).toHaveBeenCalledTimes(1);
  expect(mockAuth.updateSessionExpiry).toHaveBeenNthCalledWith(
    1,
    DEFAULT_SYSTEM_SETTINGS,
    { sessionExpiresAt: expect.any(Date) }
  );
});

test('startCardlessVoterSession before election definition has been configured', async () => {
  await apiClient.startCardlessVoterSession({
    ballotStyleId: 'b1',
    precinctId: 'p1',
  });
  expect(mockAuth.startCardlessVoterSession).toHaveBeenCalledTimes(1);
  expect(mockAuth.startCardlessVoterSession).toHaveBeenNthCalledWith(
    1,
    DEFAULT_SYSTEM_SETTINGS,
    { ballotStyleId: 'b1', precinctId: 'p1' }
  );
});

test('endCardlessVoterSession before election definition has been configured', async () => {
  await apiClient.endCardlessVoterSession();
  expect(mockAuth.endCardlessVoterSession).toHaveBeenCalledTimes(1);
  expect(mockAuth.endCardlessVoterSession).toHaveBeenNthCalledWith(
    1,
    DEFAULT_SYSTEM_SETTINGS
  );
});
