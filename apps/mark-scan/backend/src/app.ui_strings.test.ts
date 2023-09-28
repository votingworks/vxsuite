import os from 'os';
import tmp from 'tmp';

import {
  MockUsb,
  createMockUsb,
  runUiStringApiTests,
  runUiStringMachineConfigurationTests,
} from '@votingworks/backend';
import { fakeLogger } from '@votingworks/logging';
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
  fakeElectionManagerUser,
  fakeSessionExpiresAt,
} from '@votingworks/test-utils';
import { Store } from './store';
import { createWorkspace } from './util/workspace';
import { Api, buildApi } from './app';

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
  api: buildApi(mockAuth, createMockUsb().mock, fakeLogger(), workspace),
  store: store.getUiStringsStore(),
});

describe('configureBallotPackageFromUsb', () => {
  let mockUsbDrive: MockUsb;
  let api: Api;

  beforeEach(() => {
    mockFeatureFlagger.resetFeatureFlags();
    mockFeatureFlagger.enableFeatureFlag(
      BooleanEnvironmentVariableName.SKIP_BALLOT_PACKAGE_AUTHENTICATION
    );

    mockUsbDrive = createMockUsb();
    api = buildApi(
      mockAuth,
      mockUsbDrive.mock,
      fakeLogger(),
      workspace,
      undefined,
      os.tmpdir()
    );

    mockAuth.getAuthStatus.mockImplementation(() =>
      Promise.resolve({
        status: 'logged_in',
        user: fakeElectionManagerUser(electionPackage.electionDefinition),
        sessionExpiresAt: fakeSessionExpiresAt(),
      })
    );
  });

  runUiStringMachineConfigurationTests({
    electionPackage,
    getMockUsbDrive: () => mockUsbDrive,
    runConfigureMachine: () => api.configureBallotPackageFromUsb(),
    store: store.getUiStringsStore(),
  });
});
