import tmp from 'tmp';

import {
  runUiStringApiTests,
  runUiStringMachineConfigurationTests,
  runUiStringMachineDeconfigurationTests,
} from '@votingworks/backend';
import { buildMockInsertedSmartCardAuth } from '@votingworks/auth';
import { fakeLogger } from '@votingworks/logging';
import { createMockUsbDrive } from '@votingworks/usb-drive';

import {
  fakeElectionManagerUser,
  fakeSessionExpiresAt,
} from '@votingworks/test-utils';
import {
  BooleanEnvironmentVariableName,
  getFeatureFlagMock,
} from '@votingworks/utils';
import {
  safeParseElectionDefinitionExtended,
  testCdfBallotDefinition,
} from '@votingworks/types';
import { Store } from './store';
import { buildApi } from './app';
import { createWorkspace } from './util/workspace';
import { createPrecinctScannerStateMachineMock } from '../test/helpers/custom_helpers';

const mockFeatureFlagger = getFeatureFlagMock();

jest.mock('@votingworks/utils', (): typeof import('@votingworks/utils') => {
  return {
    ...jest.requireActual('@votingworks/utils'),
    isFeatureFlagEnabled: (flag) => mockFeatureFlagger.isEnabled(flag),
  };
});

const store = Store.memoryStore();
const workspace = createWorkspace(tmp.dirSync().name, { store });
const mockUsbDrive = createMockUsbDrive();
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
    createPrecinctScannerStateMachineMock(),
    workspace,
    mockUsbDrive.usbDrive,
    fakeLogger()
  ),
  store: store.getUiStringsStore(),
});

describe('configureFromElectionPackageOnUsbDrive', () => {
  beforeEach(() => {
    mockFeatureFlagger.resetFeatureFlags();
    mockFeatureFlagger.enableFeatureFlag(
      BooleanEnvironmentVariableName.SKIP_ELECTION_PACKAGE_AUTHENTICATION
    );

    mockAuth.getAuthStatus.mockImplementation(() =>
      Promise.resolve({
        status: 'logged_in',
        user: fakeElectionManagerUser(electionPackage.electionDefinition),
        sessionExpiresAt: fakeSessionExpiresAt(),
      })
    );
  });

  const api = buildApi(
    mockAuth,
    createPrecinctScannerStateMachineMock(),
    workspace,
    mockUsbDrive.usbDrive,
    fakeLogger()
  );

  runUiStringMachineConfigurationTests({
    electionPackage,
    getMockUsbDrive: () => mockUsbDrive,
    runConfigureMachine: () => api.configureFromElectionPackageOnUsbDrive(),
    store: store.getUiStringsStore(),
  });
});

describe('unconfigureElection', () => {
  const api = buildApi(
    mockAuth,
    createPrecinctScannerStateMachineMock(),
    workspace,
    mockUsbDrive.usbDrive,
    fakeLogger()
  );

  runUiStringMachineDeconfigurationTests({
    runUnconfigureMachine: () => api.unconfigureElection(),
    store: store.getUiStringsStore(),
  });
});
