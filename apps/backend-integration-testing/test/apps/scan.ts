import { vi, expect } from 'vitest';
import {
  InsertedSmartCardAuth,
  InsertedSmartCardAuthApi,
  MockFileCard,
} from '@votingworks/auth';
import * as grout from '@votingworks/grout';
import { AddressInfo } from 'node:net';
import tmp from 'tmp';
import { MockFileUsbDrive } from '@votingworks/usb-drive';
import {
  LogSource,
  mockBaseLogger,
  MockLogger,
  mockLogger,
} from '@votingworks/logging';
import {
  Api,
  buildApp,
  createWorkspace,
  Workspace,
  getUserRole,
  wrapFujitsuThermalPrinter,
  pdiStateMachine,
  AudioPlayer,
} from '@votingworks/scan-backend';
import { createMockPdiScanner, MockScanner } from '@votingworks/pdi-scanner';
import {
  createMockFujitsuPrinterHandler,
  MemoryFujitsuPrinterHandler,
} from '@votingworks/fujitsu-thermal-printer';
import { backendWaitFor } from '@votingworks/test-utils';
import {
  deleteTmpFileAfterTestSuiteCompletes,
  resetSharedMocks,
} from '../cleanup';
import { bmdImageDataFromPdf } from '../ballots';

export function buildMockLogger(
  auth: InsertedSmartCardAuthApi,
  workspace: Workspace
): MockLogger {
  return mockLogger({
    source: LogSource.VxAdminService,
    getCurrentRole: () => getUserRole(auth, workspace),
    fn: vi.fn,
  });
}

export async function withScan(
  fn: ({
    apiClient,
    mockFujitsuPrinterHandler,
    mockPdiScanner,
  }: {
    apiClient: grout.Client<Api>;
    mockFujitsuPrinterHandler: MemoryFujitsuPrinterHandler;
    mockPdiScanner: MockScanner;
  }) => Promise<void>
): Promise<void> {
  const baseLogger = mockBaseLogger({ fn: vi.fn });
  const auth = new InsertedSmartCardAuth({
    card: new MockFileCard(),
    config: {},
    logger: baseLogger,
  });
  const resolvedWorkspaceRoot = (() => {
    const defaultWorkspaceRoot = tmp.dirSync().name;
    deleteTmpFileAfterTestSuiteCompletes(defaultWorkspaceRoot);
    return defaultWorkspaceRoot;
  })();
  const workspace = createWorkspace(
    resolvedWorkspaceRoot,
    mockBaseLogger({ fn: vi.fn })
  );
  const logger = buildMockLogger(auth, workspace);
  const mockFujitsuPrinterHandler = createMockFujitsuPrinterHandler();
  const mockPdiScanner = createMockPdiScanner();
  const usbDrive = new MockFileUsbDrive();
  const audioPlayer = new AudioPlayer('test', logger, 'mock');
  const precinctScannerStateMachine =
    pdiStateMachine.createPrecinctScannerStateMachine({
      scannerClient:
        /* istanbul ignore next - @preserve */
        mockPdiScanner.client,
      workspace,
      usbDrive,
      auth,
      logger,
    });

  const app = buildApp({
    auth,
    workspace,
    logger,
    usbDrive,
    printer: wrapFujitsuThermalPrinter(mockFujitsuPrinterHandler.printer),
    audioPlayer,
    machine: precinctScannerStateMachine,
  });
  // port 0 will bind to a random, free port assigned by the OS
  const server = app.listen();
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://localhost:${port}/api`;
  const apiClient = grout.createClient<Api>({
    baseUrl,
  });

  resetSharedMocks();
  process.env.VX_MACHINE_TYPE = 'scan';
  await fn({
    apiClient,
    mockFujitsuPrinterHandler,
    mockPdiScanner,
  });
  resetSharedMocks();
}

export async function scanBallot(
  apiClient: grout.Client<Api>,
  mockPdiScanner: MockScanner,
  path: string
): Promise<void> {
  await backendWaitFor(
    async () => {
      expect((await apiClient.getScannerStatus()).state).toEqual('no_paper');
    },
    { interval: 1000, retries: 3 }
  );
  mockPdiScanner.insertSheet(await bmdImageDataFromPdf(path));
  await backendWaitFor(
    async () => {
      expect((await apiClient.getScannerStatus()).state).toEqual('accepted');
    },
    { interval: 1000, retries: 3 }
  );
  await apiClient.readyForNextBallot();
}
