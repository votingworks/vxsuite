import { expect, vi } from 'vitest';
import {
  buildMockDippedSmartCardAuth,
  DippedSmartCardAuthApi,
} from '@votingworks/auth';
import { AddressInfo } from 'node:net';
import { createMockUsbDrive, MockUsbDrive } from '@votingworks/usb-drive';
import {
  createMockPrinterHandler,
  MemoryPrinterHandler,
} from '@votingworks/printing';
import * as grout from '@votingworks/grout';
import {
  LogSource,
  mockBaseLogger,
  MockLogger,
  mockLogger,
} from '@votingworks/logging';
import { makeTemporaryDirectory } from '@votingworks/fixtures';
import { Server } from 'node:http';
import {
  constructElectionKey,
  DippedSmartCardAuth,
  EncodedBallotEntry,
  ElectionDefinition,
  SystemSettings,
  TEST_JURISDICTION,
  BallotType,
} from '@votingworks/types';
import {
  mockElectionManagerUser,
  mockSessionExpiresAt,
} from '@votingworks/test-utils';
import { mockElectionPackageFileTree } from '@votingworks/backend';
import { ok } from '@votingworks/basics';
import { Buffer } from 'node:buffer';
import { getUserRole } from '../src/util/auth';
import { createWorkspace, Workspace } from '../src/util/workspace';
import { buildApp } from '../src/app';
import { Api } from '../src';

export function mockAuthStatus(
  auth: DippedSmartCardAuthApi,
  authStatus: DippedSmartCardAuth.AuthStatus
): void {
  vi.mocked(auth.getAuthStatus).mockResolvedValue(authStatus);
}

export function mockElectionManagerAuth(
  auth: DippedSmartCardAuthApi,
  electionDefinition: ElectionDefinition,
  jurisdiction: string = TEST_JURISDICTION // do we need this?
): void {
  mockAuthStatus(auth, {
    status: 'logged_in',
    user: mockElectionManagerUser({
      electionKey: constructElectionKey(electionDefinition.election),
      jurisdiction,
    }),
    sessionExpiresAt: mockSessionExpiresAt(),
  });
}

export async function configureFromUsb(
  apiClient: grout.Client<Api>,
  auth: DippedSmartCardAuthApi,
  mockUsbDrive: MockUsbDrive,
  {
    electionDefinition,
    systemSettings,
    ballots,
  }: {
    electionDefinition: ElectionDefinition;
    systemSettings: SystemSettings;
    ballots?: EncodedBallotEntry[];
  }
): Promise<void> {
  mockElectionManagerAuth(auth, electionDefinition);

  const ballotStyleId = electionDefinition.election.ballotStyles[0]?.id;
  const precinctId = electionDefinition.election.precincts[0]?.id;
  if (!(ballotStyleId && precinctId)) {
    throw new Error(
      'Election fixture must include at least one ballot style and precinct.'
    );
  }

  const defaultBallots: EncodedBallotEntry[] = [
    {
      ballotStyleId,
      precinctId,
      ballotType: BallotType.Precinct,
      ballotMode: 'official',
      encodedBallot: Buffer.from('mock-pdf-data-for-test').toString('base64'),
    },
  ];

  mockUsbDrive.insertUsbDrive(
    await mockElectionPackageFileTree({
      electionDefinition,
      systemSettings,
      ballots: ballots ?? defaultBallots,
    })
  );

  const result = await apiClient.configureElectionPackageFromUsb();
  expect(result).toEqual(ok(expect.anything()));
}

export function buildMockLogger(
  auth: DippedSmartCardAuthApi,
  workspace: Workspace
): MockLogger {
  return mockLogger({
    source: LogSource.VxPrintBackend,
    getCurrentRole: () => getUserRole(auth, workspace),
    fn: vi.fn,
  });
}

export function buildTestEnvironment(): {
  apiClient: grout.Client<Api>;
  app: ReturnType<typeof buildApp>;
  auth: DippedSmartCardAuthApi;
  logger: MockLogger;
  mockPrinterHandler: MemoryPrinterHandler;
  mockUsbDrive: MockUsbDrive;
  server: Server;
  workspace: Workspace;
} {
  const auth = buildMockDippedSmartCardAuth(vi.fn);
  const workspace = createWorkspace(
    makeTemporaryDirectory(),
    mockBaseLogger({ fn: vi.fn })
  );
  const logger = buildMockLogger(auth, workspace);
  const mockUsbDrive = createMockUsbDrive();
  const mockPrinterHandler = createMockPrinterHandler();

  const app = buildApp({
    auth,
    workspace,
    logger,
    usbDrive: mockUsbDrive.usbDrive,
    printer: mockPrinterHandler.printer,
  });

  // port 0 binds to a random, free port assigned by the OS
  const server = app.listen();
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://localhost:${port}/api`;
  const apiClient = grout.createClient<Api>({ baseUrl });

  mockAuthStatus(auth, { status: 'logged_out', reason: 'machine_locked' });

  return {
    apiClient,
    app,
    auth,
    logger,
    mockPrinterHandler,
    mockUsbDrive,
    server,
    workspace,
  };
}
