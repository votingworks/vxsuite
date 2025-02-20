import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import tmp from 'tmp';

import {
  runUiStringApiTests,
  runUiStringMachineConfigurationTests,
  runUiStringMachineDeconfigurationTests,
} from '@votingworks/backend';
import { buildMockInsertedSmartCardAuth } from '@votingworks/auth';
import {
  constructElectionKey,
  safeParseElectionDefinition,
  testCdfBallotDefinition,
} from '@votingworks/types';
import {
  BooleanEnvironmentVariableName,
  getFeatureFlagMock,
} from '@votingworks/utils';

import {
  mockElectionManagerUser,
  mockSessionExpiresAt,
} from '@votingworks/test-utils';
import { MockUsbDrive, createMockUsbDrive } from '@votingworks/usb-drive';
import { createMockPrinterHandler } from '@votingworks/printing';
import { mockBaseLogger } from '@votingworks/logging';
import { Store } from './store';
import { createWorkspace } from './util/workspace';
import { Api, buildApi } from './app';
import { buildMockLogger } from '../test/app_helpers';

const mockFeatureFlagger = getFeatureFlagMock();

vi.mock(import('@votingworks/utils'), async (importActual) => ({
  ...(await importActual()),
  isFeatureFlagEnabled: (flag) => mockFeatureFlagger.isEnabled(flag),
}));

const store = Store.memoryStore();
const workspace = createWorkspace(
  tmp.dirSync().name,
  mockBaseLogger({ fn: vi.fn }),
  {
    store,
  }
);
const mockAuth = buildMockInsertedSmartCardAuth(vi.fn);
const electionDefinition = safeParseElectionDefinition(
  JSON.stringify(testCdfBallotDefinition)
).unsafeUnwrap();

afterEach(() => {
  workspace.reset();
});

runUiStringApiTests({
  api: buildApi(
    mockAuth,
    createMockUsbDrive().usbDrive,
    createMockPrinterHandler().printer,
    buildMockLogger(mockAuth, workspace),
    workspace
  ),
  store: store.getUiStringsStore(),
  afterEach,
  expect,
  test,
  clearAllMocks: vi.clearAllMocks,
});

describe('configureElectionPackageFromUsb', () => {
  let mockUsbDrive: MockUsbDrive;
  let api: Api;

  beforeEach(() => {
    mockFeatureFlagger.resetFeatureFlags();
    mockFeatureFlagger.enableFeatureFlag(
      BooleanEnvironmentVariableName.SKIP_ELECTION_PACKAGE_AUTHENTICATION
    );

    mockUsbDrive = createMockUsbDrive();
    api = buildApi(
      mockAuth,
      mockUsbDrive.usbDrive,
      createMockPrinterHandler().printer,
      buildMockLogger(mockAuth, workspace),
      workspace
    );

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
    runConfigureMachine: () => api.configureElectionPackageFromUsb(),
    store: store.getUiStringsStore(),
    expect,
    test,
  });
});

describe('unconfigureMachine', () => {
  const api = buildApi(
    mockAuth,
    createMockUsbDrive().usbDrive,
    createMockPrinterHandler().printer,
    buildMockLogger(mockAuth, workspace),
    workspace
  );

  runUiStringMachineDeconfigurationTests({
    runUnconfigureMachine: () => api.unconfigureMachine(),
    store: store.getUiStringsStore(),
    expect,
    test,
  });
});
