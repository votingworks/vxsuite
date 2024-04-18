import tmp from 'tmp';

import {
  runUiStringApiTests,
  runUiStringMachineConfigurationTests,
  runUiStringMachineDeconfigurationTests,
} from '@votingworks/backend';
import { buildMockInsertedSmartCardAuth } from '@votingworks/auth';
import {
  safeParseElectionDefinitionExtended,
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
import { Store } from './store';
import { createWorkspace } from './util/workspace';
import { Api, buildApi } from './app';
import { buildMockLogger } from '../test/app_helpers';

const mockFeatureFlagger = getFeatureFlagMock();

jest.mock('@votingworks/utils', (): typeof import('@votingworks/utils') => {
  return {
    ...jest.requireActual('@votingworks/utils'),
    isFeatureFlagEnabled: (flag) => mockFeatureFlagger.isEnabled(flag),
  };
});

const store = Store.memoryStore();
const workspace = createWorkspace(tmp.dirSync().name, { store });
const mockAuth = buildMockInsertedSmartCardAuth();
const electionPackage = safeParseElectionDefinitionExtended(
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
      workspace,
      undefined
    );

    mockAuth.getAuthStatus.mockImplementation(() =>
      Promise.resolve({
        status: 'logged_in',
        user: mockElectionManagerUser(electionPackage.electionDefinition),
        sessionExpiresAt: mockSessionExpiresAt(),
      })
    );
  });

  runUiStringMachineConfigurationTests({
    electionPackage,
    getMockUsbDrive: () => mockUsbDrive,
    runConfigureMachine: () => api.configureElectionPackageFromUsb(),
    store: store.getUiStringsStore(),
  });
});

describe('unconfigureMachine', () => {
  const api = buildApi(
    mockAuth,
    createMockUsbDrive().usbDrive,
    buildMockLogger(mockAuth, workspace),
    workspace,
    undefined
  );

  runUiStringMachineDeconfigurationTests({
    runUnconfigureMachine: () => api.unconfigureMachine(),
    store: store.getUiStringsStore(),
  });
});
