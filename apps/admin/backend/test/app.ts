/* eslint-disable vx/gts-jsdoc */

import {
  buildMockDippedSmartCardAuth,
  DippedSmartCardAuthApi,
} from '@votingworks/auth';
import {
  fakeElectionManagerUser,
  fakeSystemAdministratorUser,
  mockOf,
} from '@votingworks/test-utils';
import { DippedSmartCardAuth, ElectionDefinition } from '@votingworks/types';
import * as grout from '@votingworks/grout';
import { assert } from '@votingworks/basics';
import { fakeLogger, Logger } from '@votingworks/logging';
import { dirSync } from 'tmp';
import { Application } from 'express';
import { AddressInfo } from 'net';
import { Api } from '../src';
import { createWorkspace, Workspace } from '../src/util/workspace';
import { buildApp } from '../src/app';

export function mockAuthStatus(
  auth: DippedSmartCardAuthApi,
  authStatus: DippedSmartCardAuth.AuthStatus
): void {
  const mockGetAuthStatus = mockOf(auth.getAuthStatus);
  mockGetAuthStatus.mockResolvedValue(authStatus);
}

export function mockMachineLocked(auth: DippedSmartCardAuthApi): void {
  mockAuthStatus(auth, {
    status: 'logged_out',
    reason: 'machine_locked',
  });
}

export function mockSystemAdministratorAuth(
  auth: DippedSmartCardAuthApi
): void {
  mockAuthStatus(auth, {
    status: 'logged_in',
    user: fakeSystemAdministratorUser(),
    programmableCard: { status: 'no_card' },
  });
}

export function mockElectionManagerAuth(
  auth: DippedSmartCardAuthApi,
  electionHash: string
): void {
  mockAuthStatus(auth, {
    status: 'logged_in',
    user: fakeElectionManagerUser({ electionHash }),
  });
}

// For now, returns electionId for client calls that still need it
export async function configureMachine(
  apiClient: grout.Client<Api>,
  auth: DippedSmartCardAuthApi,
  electionDefinition: ElectionDefinition
): Promise<string> {
  mockSystemAdministratorAuth(auth);
  const { electionData } = electionDefinition;
  const configureResult = await apiClient.configure({
    electionData,
  });
  assert(configureResult.isOk());
  return configureResult.ok().electionId;
}

export function buildTestEnvironment(): {
  logger: Logger;
  auth: DippedSmartCardAuthApi;
  workspace: Workspace;
  app: Application;
  apiClient: grout.Client<Api>;
} {
  const logger = fakeLogger();
  const auth = buildMockDippedSmartCardAuth();
  const workspace = createWorkspace(dirSync().name);
  const app = buildApp({ auth, workspace, logger });
  // port 0 will bind to a random, free port assigned by the OS
  const server = app.listen();
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://localhost:${port}/api`;
  const apiClient = grout.createClient<Api>({
    baseUrl,
  });

  mockMachineLocked(auth);

  return {
    logger,
    auth,
    workspace,
    app,
    apiClient,
  };
}
