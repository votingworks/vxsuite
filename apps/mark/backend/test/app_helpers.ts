import { expect, vi } from 'vitest';
import {
  buildMockInsertedSmartCardAuth,
  type InsertedSmartCardAuthApi,
} from '@votingworks/auth';
import * as grout from '@votingworks/grout';
import type { Application } from 'express';
import type { AddressInfo } from 'node:net';
import {
  mockLogger,
  LogSource,
  type Logger,
  mockBaseLogger,
} from '@votingworks/logging';
import tmp from 'tmp';
import { mockElectionPackageFileTree } from '@votingworks/backend';
import type { Server } from 'node:http';
import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import {
  mockElectionManagerUser,
  mockSessionExpiresAt,
} from '@votingworks/test-utils';
import {
  DEFAULT_SYSTEM_SETTINGS,
  constructElectionKey,
  type SystemSettings,
  TEST_JURISDICTION,
} from '@votingworks/types';
import { createMockUsbDrive, type MockUsbDrive } from '@votingworks/usb-drive';
import {
  createMockPrinterHandler,
  type MemoryPrinterHandler,
} from '@votingworks/printing';
import { ok } from '@votingworks/basics';
import { type Api, buildApp } from '../src/app.js';
import { createWorkspace, type Workspace } from '../src/util/workspace.js';
import { getUserRole } from '../src/util/auth.js';
import type { Player as AudioPlayer } from '../src/audio/player.js';
import { MockBarcodeClient } from '../src/barcodes/mock_client.js';

interface MockAppContents {
  apiClient: grout.Client<Api>;
  app: Application;
  logger: Logger;
  mockAuth: InsertedSmartCardAuthApi;
  mockUsbDrive: MockUsbDrive;
  mockPrinterHandler: MemoryPrinterHandler;
  mockAudioPlayer?: AudioPlayer;
  server: Server;
  workspace: Workspace;
  mockBarcodeClient: MockBarcodeClient;
}

export function buildMockLogger(
  auth: InsertedSmartCardAuthApi,
  workspace: Workspace
): Logger {
  return mockLogger({
    source: LogSource.VxMarkBackend,
    getCurrentRole: () => getUserRole(auth, workspace),
    fn: vi.fn,
  });
}

function createMockBarcodeClient(): MockBarcodeClient {
  return new MockBarcodeClient();
}

export function createApp(options?: {
  audioPlayer?: AudioPlayer;
}): MockAppContents {
  const workspace = createWorkspace(
    tmp.dirSync().name,
    mockBaseLogger({ fn: vi.fn })
  );
  const mockAuth = buildMockInsertedSmartCardAuth(vi.fn);
  const logger = buildMockLogger(mockAuth, workspace);
  const mockUsbDrive = createMockUsbDrive();
  const mockPrinterHandler = createMockPrinterHandler();
  const mockBarcodeClient = createMockBarcodeClient();

  const app = buildApp({
    audioPlayer: options?.audioPlayer,
    auth: mockAuth,
    logger,
    workspace,
    usbDrive: mockUsbDrive.usbDrive,
    printer: mockPrinterHandler.printer,
    barcodeClient: mockBarcodeClient,
  });

  const server = app.listen();
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://localhost:${port}/api`;

  const apiClient = grout.createClient<Api>({ baseUrl });

  return {
    apiClient,
    app,
    logger,
    mockAuth,
    mockUsbDrive,
    mockPrinterHandler,
    mockAudioPlayer: options?.audioPlayer,
    server,
    workspace,
    mockBarcodeClient,
  };
}

export async function configureApp(
  apiClient: grout.Client<Api>,
  mockAuth: InsertedSmartCardAuthApi,
  mockUsbDrive: MockUsbDrive,
  systemSettings: SystemSettings = DEFAULT_SYSTEM_SETTINGS
): Promise<void> {
  const jurisdiction = TEST_JURISDICTION;
  const { electionJson } = electionFamousNames2021Fixtures;
  vi.mocked(mockAuth.getAuthStatus).mockImplementation(() =>
    Promise.resolve({
      status: 'logged_in',
      user: mockElectionManagerUser({
        electionKey: constructElectionKey(electionJson.readElection()),
        jurisdiction,
      }),
      sessionExpiresAt: mockSessionExpiresAt(),
    })
  );
  mockUsbDrive.insertUsbDrive(
    await mockElectionPackageFileTree(
      electionJson.toElectionPackage(systemSettings)
    )
  );
  const result = await apiClient.configureElectionPackageFromUsb();
  expect(result).toEqual(ok(expect.anything()));
  vi.mocked(mockAuth.getAuthStatus).mockImplementation(() =>
    Promise.resolve({
      status: 'logged_out',
      reason: 'no_card',
    })
  );
}
