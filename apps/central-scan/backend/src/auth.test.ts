import getPort from 'get-port';
import { Server } from 'http';
import { DateTime } from 'luxon';
import { dirSync } from 'tmp';
import {
  buildMockDippedSmartCardAuth,
  DippedSmartCardAuthApi,
} from '@votingworks/auth';
import * as grout from '@votingworks/grout';
import { fakeLogger, Logger } from '@votingworks/logging';
import {
  DEFAULT_SYSTEM_SETTINGS,
  SystemSettings,
  TEST_JURISDICTION,
} from '@votingworks/types';

import { electionGridLayoutNewHampshireTestBallotFixtures } from '@votingworks/fixtures';
import { createMockUsbDrive } from '@votingworks/usb-drive';
import { makeMockScanner } from '../test/util/mocks';
import { Api, buildCentralScannerApp } from './app';
import { Importer } from './importer';
import { start } from './server';
import { createWorkspace, Workspace } from './util/workspace';

let apiClient: grout.Client<Api>;
let auth: DippedSmartCardAuthApi;
let server: Server;
let workspace: Workspace;
let logger: Logger;

beforeEach(async () => {
  const port = await getPort();
  auth = buildMockDippedSmartCardAuth();
  workspace = createWorkspace(dirSync().name);
  logger = fakeLogger();

  apiClient = grout.createClient({
    baseUrl: `http://localhost:${port}/api`,
  });
  server = await start({
    app: buildCentralScannerApp({
      auth,
      usbDrive: createMockUsbDrive().usbDrive,
      importer: new Importer({ workspace, scanner: makeMockScanner() }),
      workspace,
      logger,
    }),
    logger,
    workspace,
    port,
  });
});

afterEach(() => {
  server.close();
});

const jurisdiction = TEST_JURISDICTION;
const { electionDefinition } = electionGridLayoutNewHampshireTestBallotFixtures;
const { electionData, electionHash } = electionDefinition;
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

// eslint-disable-next-line @typescript-eslint/no-shadow
function configureMachine(systemSettings: SystemSettings): void {
  workspace.store.setElectionAndJurisdiction({ electionData, jurisdiction });
  workspace.store.setSystemSettings(systemSettings);
}

test('getAuthStatus', async () => {
  configureMachine(systemSettings);

  await apiClient.getAuthStatus();
  expect(auth.getAuthStatus).toHaveBeenCalledTimes(1);
  expect(auth.getAuthStatus).toHaveBeenNthCalledWith(1, {
    electionHash,
    jurisdiction,
    ...systemSettings.auth,
  });
});

test('checkPin', async () => {
  configureMachine(systemSettings);

  await apiClient.checkPin({ pin: '123456' });
  expect(auth.checkPin).toHaveBeenCalledTimes(1);
  expect(auth.checkPin).toHaveBeenNthCalledWith(
    1,
    { electionHash, jurisdiction, ...systemSettings.auth },
    { pin: '123456' }
  );
});

test('logOut', async () => {
  configureMachine(systemSettings);

  await apiClient.logOut();
  expect(auth.logOut).toHaveBeenCalledTimes(1);
  expect(auth.logOut).toHaveBeenNthCalledWith(1, {
    electionHash,
    jurisdiction,
    ...systemSettings.auth,
  });
});

test('updateSessionExpiry', async () => {
  configureMachine(systemSettings);

  await apiClient.updateSessionExpiry({
    sessionExpiresAt: DateTime.now().plus({ seconds: 60 }).toJSDate(),
  });
  expect(auth.updateSessionExpiry).toHaveBeenCalledTimes(1);
  expect(auth.updateSessionExpiry).toHaveBeenNthCalledWith(
    1,
    { electionHash, jurisdiction, ...systemSettings.auth },
    { sessionExpiresAt: expect.any(Date) }
  );
});

test('getAuthStatus before election definition has been configured', async () => {
  await apiClient.getAuthStatus();
  expect(auth.getAuthStatus).toHaveBeenCalledTimes(1);
  expect(auth.getAuthStatus).toHaveBeenNthCalledWith(
    1,
    DEFAULT_SYSTEM_SETTINGS.auth
  );
});

test('checkPin before election definition has been configured', async () => {
  await apiClient.checkPin({ pin: '123456' });
  expect(auth.checkPin).toHaveBeenCalledTimes(1);
  expect(auth.checkPin).toHaveBeenNthCalledWith(
    1,
    DEFAULT_SYSTEM_SETTINGS.auth,
    {
      pin: '123456',
    }
  );
});

test('logOut before election definition has been configured', async () => {
  await apiClient.logOut();
  expect(auth.logOut).toHaveBeenCalledTimes(1);
  expect(auth.logOut).toHaveBeenNthCalledWith(1, DEFAULT_SYSTEM_SETTINGS.auth);
});

test('updateSessionExpiry before election definition has been configured', async () => {
  await apiClient.updateSessionExpiry({
    sessionExpiresAt: DateTime.now().plus({ seconds: 60 }).toJSDate(),
  });
  expect(auth.updateSessionExpiry).toHaveBeenCalledTimes(1);
  expect(auth.updateSessionExpiry).toHaveBeenNthCalledWith(
    1,
    DEFAULT_SYSTEM_SETTINGS.auth,
    { sessionExpiresAt: expect.any(Date) }
  );
});
