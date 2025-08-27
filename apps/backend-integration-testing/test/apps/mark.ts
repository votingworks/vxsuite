import {
  Api,
  buildApp,
  createWorkspace,
  getUserRole,
  Workspace,
} from '@votingworks/mark-backend';
import * as grout from '@votingworks/grout';
import {
  createMockPrinterHandler,
  MemoryPrinterHandler,
} from '@votingworks/printing';
import {
  LogSource,
  mockBaseLogger,
  mockLogger,
  MockLogger,
} from '@votingworks/logging';
import tmp from 'tmp';
import {
  InsertedSmartCardAuth,
  InsertedSmartCardAuthApi,
  MockFileCard,
} from '@votingworks/auth';
import { MockFileUsbDrive } from '@votingworks/usb-drive';
import { vi } from 'vitest';
import { AddressInfo } from 'node:net';
import {
  deleteTmpFileAfterTestSuiteCompletes,
  resetSharedMocks,
} from '../cleanup';

export function buildMockLogger(
  auth: InsertedSmartCardAuthApi,
  workspace: Workspace
): MockLogger {
  return mockLogger({
    source: LogSource.VxMarkBackend,
    getCurrentRole: () => getUserRole(auth, workspace),
    fn: vi.fn,
  });
}

export async function withMark(
  fn: ({
    apiClient,
    mockPrinterHandler,
  }: {
    apiClient: grout.Client<Api>;
    mockPrinterHandler: MemoryPrinterHandler;
  }) => Promise<void>
): Promise<void> {
  const baseLogger = mockBaseLogger({ fn: vi.fn });
  const auth = new InsertedSmartCardAuth({
    card: new MockFileCard(),
    config: { allowCardlessVoterSessions: true },
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
  const mockPrinterHandler = createMockPrinterHandler();
  const app = buildApp(
    auth,
    logger,
    workspace,
    new MockFileUsbDrive(),
    mockPrinterHandler.printer
  );
  // port 0 will bind to a random, free port assigned by the OS
  const server = app.listen();
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://localhost:${port}/api`;
  const apiClient = grout.createClient<Api>({
    baseUrl,
  });

  resetSharedMocks();
  process.env.VX_MACHINE_TYPE = 'mark';
  await fn({
    apiClient,
    mockPrinterHandler,
  });
  resetSharedMocks();
}
