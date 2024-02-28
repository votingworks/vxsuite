import tmp from 'tmp';

import {
  runUiStringApiTests,
  runUiStringMachineConfigurationTests,
  runUiStringMachineDeconfigurationTests,
} from '@votingworks/backend';
import { buildMockInsertedSmartCardAuth } from '@votingworks/auth';
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
import { createMockPrinterHandler } from '@votingworks/printing';
import { Store } from './store';
import { buildApi } from './app';
import { createWorkspace } from './util/workspace';
import {
  buildMockLogger,
  createPrecinctScannerStateMachineMock,
} from '../test/helpers/custom_helpers';

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
const { printer } = createMockPrinterHandler();
const mockAuth = buildMockInsertedSmartCardAuth();
const electionPackage = safeParseElectionDefinitionExtended(
  JSON.stringify(testCdfBallotDefinition)
).unsafeUnwrap();

afterEach(() => {
  workspace.reset();
});

runUiStringApiTests({
  api: buildApi({
    auth: mockAuth,
    machine: createPrecinctScannerStateMachineMock(),
    workspace,
    usbDrive: mockUsbDrive.usbDrive,
    printer,
    logger: buildMockLogger(mockAuth, workspace),
  }),
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

  const api = buildApi({
    auth: mockAuth,
    machine: createPrecinctScannerStateMachineMock(),
    workspace,
    usbDrive: mockUsbDrive.usbDrive,
    printer,
    logger: buildMockLogger(mockAuth, workspace),
  });

  runUiStringMachineConfigurationTests({
    electionPackage,
    getMockUsbDrive: () => mockUsbDrive,
    runConfigureMachine: () => api.configureFromElectionPackageOnUsbDrive(),
    store: store.getUiStringsStore(),
  });
});

describe('unconfigureElection', () => {
  const api = buildApi({
    auth: mockAuth,
    machine: createPrecinctScannerStateMachineMock(),
    workspace,
    usbDrive: mockUsbDrive.usbDrive,
    printer,
    logger: buildMockLogger(mockAuth, workspace),
  });

  runUiStringMachineDeconfigurationTests({
    runUnconfigureMachine: () => api.unconfigureElection(),
    store: store.getUiStringsStore(),
  });
});
