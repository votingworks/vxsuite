import { vi } from 'vitest';
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
  TEST_JURISDICTION,
  DEFAULT_SYSTEM_SETTINGS,
  BallotType,
} from '@votingworks/types';
import {
  mockElectionManagerUser,
  mockSessionExpiresAt,
} from '@votingworks/test-utils';
import { mockElectionPackageFileTree } from '@votingworks/backend';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { getUserRole } from '../src/util/auth';
import { createWorkspace, Workspace } from '../src/util/workspace';
import { buildApp } from '../src/app';
import { Api } from '../src';

async function getFamousNamesBallotPdfBase64s(): Promise<
  readonly [string, string, string, string]
> {
  const baseDir = resolve(
    process.cwd(),
    '../../../libs/hmpb/fixtures/vx-famous-names'
  );
  const [pdf1, pdf2, pdf3, pdf4] = await Promise.all([
    readFile(join(baseDir, 'blank-ballot.pdf')),
    readFile(join(baseDir, 'marked-ballot.pdf')),
    readFile(join(baseDir, 'blank-official-ballot.pdf')),
    readFile(join(baseDir, 'marked-official-ballot.pdf')),
  ]);
  return [
    pdf1.toString('base64'),
    pdf2.toString('base64'),
    pdf3.toString('base64'),
    pdf4.toString('base64'),
  ] as const;
}

// Helper to build ballots for an election definition. Generates ballots
// using the famous names PDFs in a round-robin fashion, even if the election
// is different than famous names. This is sufficient for these tests since
// we are not testing the actual content of the ballot PDF, solely that ballots
// are stored, accessed, and printed correctly. This saves time and complexity
// over generating custom PDFs for each election definition.
export async function buildBallotsForElection({
  electionDefinition,
  ballotModes,
}: {
  electionDefinition: ElectionDefinition;
  ballotModes: ReadonlyArray<'official' | 'test'>;
}): Promise<EncodedBallotEntry[]> {
  const { ballotStyles } = electionDefinition.election;
  const pdfBase64s = await getFamousNamesBallotPdfBase64s();

  const ballots: EncodedBallotEntry[] = [];
  for (const [index, ballotStyle] of ballotStyles.entries()) {
    const precinctId = ballotStyle.precincts[0];
    if (!precinctId) {
      throw new Error(`Ballot style ${ballotStyle.id} has no precincts`);
    }
    const encodedBallot = pdfBase64s[index % pdfBase64s.length];
    for (const ballotMode of ballotModes) {
      ballots.push(
        {
          ballotStyleId: ballotStyle.id,
          precinctId,
          ballotType: BallotType.Precinct,
          ballotMode,
          encodedBallot,
        },
        {
          ballotStyleId: ballotStyle.id,
          precinctId,
          ballotType: BallotType.Absentee,
          ballotMode,
          encodedBallot,
        }
      );
    }
  }

  return ballots;
}

export async function configureMachine({
  apiClient,
  mockUsbDrive,
  auth,
  electionDefinition,
  ballots,
}: {
  apiClient: grout.Client<Api>;
  mockUsbDrive: MockUsbDrive;
  auth: DippedSmartCardAuthApi;
  electionDefinition: ElectionDefinition;
  ballots: EncodedBallotEntry[];
}): Promise<void> {
  mockElectionManagerAuth(auth, electionDefinition);
  mockUsbDrive.insertUsbDrive(
    await mockElectionPackageFileTree({
      electionDefinition,
      ballots,
      systemSettings: DEFAULT_SYSTEM_SETTINGS,
    })
  );
  (await apiClient.configureElectionPackageFromUsb()).unsafeUnwrap();
  mockUsbDrive.removeUsbDrive();
}

export function mockAuthStatus(
  auth: DippedSmartCardAuthApi,
  authStatus: DippedSmartCardAuth.AuthStatus
): void {
  vi.mocked(auth.getAuthStatus).mockResolvedValue(authStatus);
}

export function mockElectionManagerAuth(
  auth: DippedSmartCardAuthApi,
  electionDefinition: ElectionDefinition,
  jurisdiction: string = TEST_JURISDICTION
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
