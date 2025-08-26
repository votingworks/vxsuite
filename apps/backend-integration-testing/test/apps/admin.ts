import { vi } from 'vitest';
import {
  DippedSmartCardAuth,
  DippedSmartCardAuthApi,
  MockFileCard,
} from '@votingworks/auth';
import * as grout from '@votingworks/grout';
import { AddressInfo } from 'node:net';
import tmp from 'tmp';
import { MockFileUsbDrive } from '@votingworks/usb-drive';
import {
  createMockPrinterHandler,
  MemoryPrinterHandler,
} from '@votingworks/printing';
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
} from '@votingworks/admin-backend';
import {
  deleteTmpFileAfterTestSuiteCompletes,
  resetSharedMocks,
} from '../cleanup';

export function buildMockLogger(
  auth: DippedSmartCardAuthApi,
  workspace: Workspace
): MockLogger {
  return mockLogger({
    source: LogSource.VxAdminService,
    getCurrentRole: () => getUserRole(auth, workspace),
    fn: vi.fn,
  });
}

interface AdminTestContext {
  apiClient: grout.Client<Api>;
  mockPrinterHandler: MemoryPrinterHandler;
}

interface AdminTestContextHolder {
  context?: AdminTestContext;
}

const adminTestContextHolder: AdminTestContextHolder = {
  context: undefined,
};

export function resetAdminTestContext(): void {
  adminTestContextHolder.context = undefined;
}

function buildAdminTestContext(): AdminTestContext {
  const baseLogger = mockBaseLogger({ fn: vi.fn });
  const auth = new DippedSmartCardAuth({
    card: new MockFileCard(),
    config: {
      allowElectionManagersToAccessUnconfiguredMachines: false,
      allowedUserRoles: ['vendor', 'system_administrator', 'election_manager'],
    },
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
  const app = buildApp({
    auth,
    workspace,
    logger,
    usbDrive: new MockFileUsbDrive(),
    printer: mockPrinterHandler.printer,
  });
  // port 0 will bind to a random, free port assigned by the OS
  const server = app.listen();
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://localhost:${port}/api`;
  const apiClient = grout.createClient<Api>({
    baseUrl,
  });

  return {
    apiClient,
    mockPrinterHandler,
  };
}

export async function withAdmin(
  fn: ({ apiClient, mockPrinterHandler }: AdminTestContext) => Promise<void>
): Promise<void> {
  const testContext = adminTestContextHolder.context ?? buildAdminTestContext();
  adminTestContextHolder.context = testContext;

  resetSharedMocks();
  process.env.VX_MACHINE_TYPE = 'admin';
  await fn(testContext);
  resetSharedMocks();
}
