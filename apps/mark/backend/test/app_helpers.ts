import {
  ArtifactAuthenticatorApi,
  buildMockArtifactAuthenticator,
  buildMockInsertedSmartCardAuth,
  InsertedSmartCardAuthApi,
} from '@votingworks/auth';
import * as grout from '@votingworks/grout';
import { Application } from 'express';
import { AddressInfo } from 'net';
import { fakeLogger } from '@votingworks/logging';
import tmp from 'tmp';
import {
  MockUsb,
  createBallotPackageZipArchive,
  createMockUsb,
} from '@votingworks/backend';
import { Server } from 'http';
import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import {
  fakeElectionManagerUser,
  fakeSessionExpiresAt,
  mockOf,
} from '@votingworks/test-utils';
import { TEST_JURISDICTION } from '@votingworks/types';
import { Api, buildApp } from '../src/app';
import { createWorkspace } from '../src/util/workspace';

interface MockAppContents {
  apiClient: grout.Client<Api>;
  app: Application;
  mockAuth: InsertedSmartCardAuthApi;
  mockArtifactAuthenticator: ArtifactAuthenticatorApi;
  mockUsb: MockUsb;
  server: Server;
}

export function createApp(): MockAppContents {
  const mockAuth = buildMockInsertedSmartCardAuth();
  const mockArtifactAuthenticator = buildMockArtifactAuthenticator();
  const logger = fakeLogger();
  const workspace = createWorkspace(tmp.dirSync().name);
  const mockUsb = createMockUsb();

  const app = buildApp(
    mockAuth,
    mockArtifactAuthenticator,
    logger,
    workspace,
    mockUsb.mock
  );

  const server = app.listen();
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://localhost:${port}/api`;

  const apiClient = grout.createClient<Api>({ baseUrl });

  return {
    apiClient,
    app,
    mockAuth,
    mockArtifactAuthenticator,
    mockUsb,
    server,
  };
}

export async function configureApp(
  apiClient: grout.Client<Api>,
  mockAuth: InsertedSmartCardAuthApi,
  mockUsb: MockUsb
): Promise<void> {
  const jurisdiction = TEST_JURISDICTION;
  const { electionJson, electionDefinition } = electionFamousNames2021Fixtures;
  const { electionHash } = electionDefinition;
  mockOf(mockAuth.getAuthStatus).mockImplementation(() =>
    Promise.resolve({
      status: 'logged_in',
      user: fakeElectionManagerUser({ electionHash, jurisdiction }),
      sessionExpiresAt: fakeSessionExpiresAt(),
    })
  );
  mockUsb.insertUsbDrive({
    'ballot-packages': {
      'test-ballot-package.zip': await createBallotPackageZipArchive(
        electionJson.toBallotPackage()
      ),
    },
  });
  const result = await apiClient.configureBallotPackageFromUsb();
  expect(result.isOk()).toEqual(true);
  mockOf(mockAuth.getAuthStatus).mockImplementation(() =>
    Promise.resolve({
      status: 'logged_out',
      reason: 'no_card',
    })
  );
}
