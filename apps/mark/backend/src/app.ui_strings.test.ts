import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import {
  runUiStringApiTests,
  runUiStringMachineConfigurationTests,
  runUiStringMachineDeconfigurationTests,
} from '@votingworks/backend';
import { buildMockInsertedSmartCardAuth } from '@votingworks/auth';
import { makeTemporaryDirectory } from '@votingworks/fixtures';
import {
  constructElectionKey,
  safeParseElectionDefinition,
  testCdfBallotDefinition,
} from '@votingworks/types';
import { BooleanEnvironmentVariableName } from '@votingworks/utils';

import {
  mockElectionManagerUser,
  mockSessionExpiresAt,
} from '@votingworks/test-utils';
import { MockUsbDrive, createMockUsbDrive } from '@votingworks/usb-drive';
import { createMockPrinterHandler } from '@votingworks/printing';
import { mockBaseLogger } from '@votingworks/logging';
import { Store } from './store.js';
import { createWorkspace, Workspace } from './util/workspace.js';
import { Api, buildApi } from './app.js';
import { buildMockLogger } from '../test/app_helpers.js';
import { MockBarcodeClient } from './barcodes/mock_client.js';

const store = Store.memoryStore();
let workspace: Workspace;

beforeEach(() => {
  workspace = createWorkspace(
    makeTemporaryDirectory(),
    mockBaseLogger({ fn: vi.fn }),
    {
      store,
    }
  );
});

const mockAuth = buildMockInsertedSmartCardAuth(vi.fn);
const electionDefinition = safeParseElectionDefinition(
  JSON.stringify(testCdfBallotDefinition)
).unsafeUnwrap();

afterEach(() => {
  workspace.reset();
});

runUiStringApiTests({
  api: () =>
    buildApi({
      auth: mockAuth,
      usbDrive: createMockUsbDrive().usbDrive,
      printer: createMockPrinterHandler().printer,
      logger: buildMockLogger(mockAuth, workspace),
      barcodeClient: new MockBarcodeClient(),
      workspace,
    }).methods(),
  store: store.getUiStringsStore(),
  beforeEach,
  afterEach,
  expect,
  test,
  resetAllMocks: vi.resetAllMocks,
});

describe('configureElectionPackageFromUsb', () => {
  let mockUsbDrive: MockUsbDrive;
  let api: Api;

  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv(
      BooleanEnvironmentVariableName.SKIP_ELECTION_PACKAGE_AUTHENTICATION,
      'TRUE'
    );

    mockUsbDrive = createMockUsbDrive();
    api = buildApi({
      auth: mockAuth,
      usbDrive: mockUsbDrive.usbDrive,
      printer: createMockPrinterHandler().printer,
      logger: buildMockLogger(mockAuth, workspace),
      barcodeClient: new MockBarcodeClient(),
      workspace,
    });

    mockAuth.getAuthStatus.mockImplementation(() =>
      Promise.resolve({
        status: 'logged_in',
        user: mockElectionManagerUser({
          electionKey: constructElectionKey(electionDefinition.election),
        }),
        sessionExpiresAt: mockSessionExpiresAt(),
      })
    );
  });

  runUiStringMachineConfigurationTests({
    electionDefinition,
    getMockUsbDrive: () => mockUsbDrive,
    runConfigureMachine: () => api.methods().configureElectionPackageFromUsb(),
    store: store.getUiStringsStore(),
    expect,
    test,
  });
});

describe('unconfigureMachine', () => {
  runUiStringMachineDeconfigurationTests({
    runUnconfigureMachine: () =>
      buildApi({
        auth: mockAuth,
        usbDrive: createMockUsbDrive().usbDrive,
        printer: createMockPrinterHandler().printer,
        logger: buildMockLogger(mockAuth, workspace),
        barcodeClient: new MockBarcodeClient(),
        workspace,
      })
        .methods()
        .unconfigureMachine(),
    store: store.getUiStringsStore(),
    expect,
    test,
  });
});
