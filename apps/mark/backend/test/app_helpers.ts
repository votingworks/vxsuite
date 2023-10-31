import {
  buildMockInsertedSmartCardAuth,
  InsertedSmartCardAuthApi,
} from '@votingworks/auth';
import * as grout from '@votingworks/grout';
import { Application } from 'express';
import { AddressInfo } from 'net';
import { fakeLogger } from '@votingworks/logging';
import tmp from 'tmp';
import { mockBallotPackageFileTree } from '@votingworks/backend';
import { Server } from 'http';
import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import {
  fakeElectionManagerUser,
  fakeSessionExpiresAt,
  mockOf,
} from '@votingworks/test-utils';
import {
  DEFAULT_SYSTEM_SETTINGS,
  SystemSettings,
  TEST_JURISDICTION,
} from '@votingworks/types';
import { createMockUsbDrive, MockUsbDrive } from '@votingworks/usb-drive';
import { Api, buildApp } from '../src/app';
import { createWorkspace } from '../src/util/workspace';

interface MockAppContents {
  apiClient: grout.Client<Api>;
  app: Application;
  mockAuth: InsertedSmartCardAuthApi;
  mockUsbDrive: MockUsbDrive;
  server: Server;
}

export function createApp(): MockAppContents {
  const mockAuth = buildMockInsertedSmartCardAuth();
  const logger = fakeLogger();
  const workspace = createWorkspace(tmp.dirSync().name);
  const mockUsbDrive = createMockUsbDrive();

  const app = buildApp(mockAuth, logger, workspace, mockUsbDrive.usbDrive);

  const server = app.listen();
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://localhost:${port}/api`;

  const apiClient = grout.createClient<Api>({ baseUrl });

  return {
    apiClient,
    app,
    mockAuth,
    mockUsbDrive,
    server,
  };
}

export async function configureApp(
  apiClient: grout.Client<Api>,
  mockAuth: InsertedSmartCardAuthApi,
  mockUsbDrive: MockUsbDrive,
  systemSettings: SystemSettings = DEFAULT_SYSTEM_SETTINGS
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
  mockUsbDrive.insertUsbDrive(
    await mockBallotPackageFileTree(
      electionJson.toBallotPackage(systemSettings)
    )
  );
  const result = await apiClient.configureBallotPackageFromUsb();
  expect(result.isOk()).toEqual(true);
  mockOf(mockAuth.getAuthStatus).mockImplementation(() =>
    Promise.resolve({
      status: 'logged_out',
      reason: 'no_card',
    })
  );
}
