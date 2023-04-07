import { Server } from 'http';
import { dirSync } from 'tmp';
import {
  buildMockDippedSmartCardAuth,
  DippedSmartCardAuthApi,
} from '@votingworks/auth';
import { Exporter } from '@votingworks/backend';
import * as grout from '@votingworks/grout';
import { fakeLogger } from '@votingworks/logging';

import * as stateOfHamilton from '../test/fixtures/state-of-hamilton';
import { makeMockScanner } from '../test/util/mocks';
import { Api, buildCentralScannerApp } from './central_scanner_app';
import { PORT } from './globals';
import { Importer } from './importer';
import { start } from './server';
import { createWorkspace, Workspace } from './util/workspace';

const { electionDefinition } = stateOfHamilton;
const { electionData, electionHash } = electionDefinition;

let apiClient: grout.Client<Api>;
let auth: DippedSmartCardAuthApi;
let server: Server;
let workspace: Workspace;

beforeEach(async () => {
  auth = buildMockDippedSmartCardAuth();
  workspace = await createWorkspace(dirSync().name);

  apiClient = grout.createClient({ baseUrl: `http://localhost:${PORT}/api` });
  server = await start({
    app: await buildCentralScannerApp({
      auth,
      exporter: new Exporter({
        allowedExportPatterns: [],
        getUsbDrives: jest.fn(),
      }),
      importer: new Importer({ workspace, scanner: makeMockScanner() }),
      workspace,
    }),
    logger: fakeLogger(),
    workspace,
  });

  workspace.store.setElection(electionData);
});

afterEach(() => {
  server.close();
});

test('getAuthStatus', async () => {
  await apiClient.getAuthStatus();
  expect(auth.getAuthStatus).toHaveBeenCalledTimes(1);
  expect(auth.getAuthStatus).toHaveBeenNthCalledWith(1, { electionHash });
});

test('checkPin', async () => {
  await apiClient.checkPin({ pin: '123456' });
  expect(auth.checkPin).toHaveBeenCalledTimes(1);
  expect(auth.checkPin).toHaveBeenNthCalledWith(
    1,
    { electionHash },
    { pin: '123456' }
  );
});

test('logOut', async () => {
  await apiClient.logOut();
  expect(auth.logOut).toHaveBeenCalledTimes(1);
  expect(auth.logOut).toHaveBeenNthCalledWith(1, { electionHash });
});

test('updateSessionExpiry', async () => {
  await apiClient.updateSessionExpiry({
    sessionExpiresAt: new Date().getTime() + 60 * 1000,
  });
  expect(auth.updateSessionExpiry).toHaveBeenCalledTimes(1);
  expect(auth.updateSessionExpiry).toHaveBeenNthCalledWith(
    1,
    { electionHash },
    { sessionExpiresAt: expect.any(Number) }
  );
});

test('getAuthStatus before election definition has been configured', async () => {
  workspace.store.setElection(undefined);

  await apiClient.getAuthStatus();
  expect(auth.getAuthStatus).toHaveBeenCalledTimes(1);
  expect(auth.getAuthStatus).toHaveBeenNthCalledWith(1, {});
});

test('checkPin before election definition has been configured', async () => {
  workspace.store.setElection(undefined);

  await apiClient.checkPin({ pin: '123456' });
  expect(auth.checkPin).toHaveBeenCalledTimes(1);
  expect(auth.checkPin).toHaveBeenNthCalledWith(1, {}, { pin: '123456' });
});

test('logOut before election definition has been configured', async () => {
  workspace.store.setElection(undefined);

  await apiClient.logOut();
  expect(auth.logOut).toHaveBeenCalledTimes(1);
  expect(auth.logOut).toHaveBeenNthCalledWith(1, {});
});

test('updateSessionExpiry before election definition has been configured', async () => {
  workspace.store.setElection(undefined);

  await apiClient.updateSessionExpiry({
    sessionExpiresAt: new Date().getTime() + 60 * 1000,
  });
  expect(auth.updateSessionExpiry).toHaveBeenCalledTimes(1);
  expect(auth.updateSessionExpiry).toHaveBeenNthCalledWith(
    1,
    {},
    { sessionExpiresAt: expect.any(Number) }
  );
});
