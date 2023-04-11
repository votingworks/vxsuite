import getPort from 'get-port';
import { Server } from 'http';
import { DateTime } from 'luxon';
import { dirSync } from 'tmp';
import {
  buildMockDippedSmartCardAuth,
  DEV_JURISDICTION,
  DippedSmartCardAuthApi,
} from '@votingworks/auth';
import { Exporter } from '@votingworks/backend';
import * as grout from '@votingworks/grout';
import { fakeLogger, Logger } from '@votingworks/logging';

import * as stateOfHamilton from '../test/fixtures/state-of-hamilton';
import { makeMockScanner } from '../test/util/mocks';
import { Api, buildCentralScannerApp } from './central_scanner_app';
import { Importer } from './importer';
import { start } from './server';
import { createWorkspace, Workspace } from './util/workspace';

const { electionDefinition } = stateOfHamilton;
const { electionData, electionHash } = electionDefinition;
const jurisdiction = DEV_JURISDICTION;

let apiClient: grout.Client<Api>;
let auth: DippedSmartCardAuthApi;
let server: Server;
let workspace: Workspace;
let logger: Logger;

beforeEach(async () => {
  const port = await getPort();
  auth = buildMockDippedSmartCardAuth();
  workspace = await createWorkspace(dirSync().name);
  logger = fakeLogger();

  apiClient = grout.createClient({
    baseUrl: `http://localhost:${port}/api`,
  });
  server = await start({
    app: await buildCentralScannerApp({
      auth,
      exporter: new Exporter({
        allowedExportPatterns: [],
        getUsbDrives: jest.fn(),
      }),
      importer: new Importer({ workspace, scanner: makeMockScanner() }),
      workspace,
      logger,
    }),
    logger,
    workspace,
    port,
  });

  workspace.store.setElection(electionData);
});

afterEach(() => {
  server.close();
});

test('getAuthStatus', async () => {
  await apiClient.getAuthStatus();
  expect(auth.getAuthStatus).toHaveBeenCalledTimes(1);
  expect(auth.getAuthStatus).toHaveBeenNthCalledWith(1, {
    electionHash,
    jurisdiction,
  });
});

test('checkPin', async () => {
  await apiClient.checkPin({ pin: '123456' });
  expect(auth.checkPin).toHaveBeenCalledTimes(1);
  expect(auth.checkPin).toHaveBeenNthCalledWith(
    1,
    { electionHash, jurisdiction },
    { pin: '123456' }
  );
});

test('logOut', async () => {
  await apiClient.logOut();
  expect(auth.logOut).toHaveBeenCalledTimes(1);
  expect(auth.logOut).toHaveBeenNthCalledWith(1, {
    electionHash,
    jurisdiction,
  });
});

test('updateSessionExpiry', async () => {
  await apiClient.updateSessionExpiry({
    sessionExpiresAt: DateTime.now().plus({ seconds: 60 }).toJSDate(),
  });
  expect(auth.updateSessionExpiry).toHaveBeenCalledTimes(1);
  expect(auth.updateSessionExpiry).toHaveBeenNthCalledWith(
    1,
    { electionHash, jurisdiction },
    { sessionExpiresAt: expect.any(Date) }
  );
});

test('getAuthStatus before election definition has been configured', async () => {
  workspace.store.setElection(undefined);

  await apiClient.getAuthStatus();
  expect(auth.getAuthStatus).toHaveBeenCalledTimes(1);
  expect(auth.getAuthStatus).toHaveBeenNthCalledWith(1, { jurisdiction });
});

test('checkPin before election definition has been configured', async () => {
  workspace.store.setElection(undefined);

  await apiClient.checkPin({ pin: '123456' });
  expect(auth.checkPin).toHaveBeenCalledTimes(1);
  expect(auth.checkPin).toHaveBeenNthCalledWith(
    1,
    { jurisdiction },
    { pin: '123456' }
  );
});

test('logOut before election definition has been configured', async () => {
  workspace.store.setElection(undefined);

  await apiClient.logOut();
  expect(auth.logOut).toHaveBeenCalledTimes(1);
  expect(auth.logOut).toHaveBeenNthCalledWith(1, { jurisdiction });
});

test('updateSessionExpiry before election definition has been configured', async () => {
  workspace.store.setElection(undefined);

  await apiClient.updateSessionExpiry({
    sessionExpiresAt: DateTime.now().plus({ seconds: 60 }).toJSDate(),
  });
  expect(auth.updateSessionExpiry).toHaveBeenCalledTimes(1);
  expect(auth.updateSessionExpiry).toHaveBeenNthCalledWith(
    1,
    { jurisdiction },
    { sessionExpiresAt: expect.any(Date) }
  );
});
