import { expect, jest, test } from '@jest/globals';
import tmp from 'tmp';

import {
  runUiStringApiTests,
  runUiStringMachineConfigurationTests,
  runUiStringMachineDeconfigurationTests,
} from '@votingworks/backend';
import { buildMockInsertedSmartCardAuth } from '@votingworks/auth';
import {
  safeParseElectionDefinition,
  testCdfBallotDefinition,
} from '@votingworks/types';
import {
  BooleanEnvironmentVariableName,
  getFeatureFlagMock,
} from '@votingworks/utils';
import { MockUsbDrive, createMockUsbDrive } from '@votingworks/usb-drive';
import { mockBaseLogger } from '@votingworks/logging';
import { Store } from './store';
import { createWorkspace } from './util/workspace';
import { Api, buildApi } from './app';
import { buildMockLogger } from '../test/app_helpers';
import { mockElectionManagerAuth } from '../test/auth_helpers';

const mockFeatureFlagger = getFeatureFlagMock();

jest.mock('@votingworks/utils', (): typeof import('@votingworks/utils') => ({
  ...jest.requireActual('@votingworks/utils'),
  isFeatureFlagEnabled: (flag) => mockFeatureFlagger.isEnabled(flag),
}));

const store = Store.memoryStore();
const workspace = createWorkspace(
  tmp.dirSync().name,
  mockBaseLogger({ fn: jest.fn }),
  {
    store,
  }
);
const mockAuth = buildMockInsertedSmartCardAuth();
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
    buildMockLogger(mockAuth, workspace),
    workspace
  ),
  store: store.getUiStringsStore(),
  afterEach,
  expect,
  test,
  resetAllMocks: jest.resetAllMocks,
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
      buildMockLogger(mockAuth, workspace),
      workspace
    );

    mockElectionManagerAuth(mockAuth, electionDefinition);
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
