import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import tmp from 'tmp';

import {
  runUiStringApiTests,
  runUiStringMachineConfigurationTests,
  runUiStringMachineDeconfigurationTests,
} from '@votingworks/backend';
import { buildMockInsertedSmartCardAuth } from '@votingworks/auth';
import { createMockUsbDrive } from '@votingworks/usb-drive';

import {
  mockElectionManagerUser,
  mockSessionExpiresAt,
} from '@votingworks/test-utils';
import {
  BooleanEnvironmentVariableName,
  getFeatureFlagMock,
} from '@votingworks/utils';
import {
  constructElectionKey,
  safeParseElectionDefinition,
  testCdfBallotDefinition,
} from '@votingworks/types';
import { createMockPrinterHandler } from '@votingworks/printing';
import { mockBaseLogger, mockLogger } from '@votingworks/logging';
import { Store } from './store';
import { buildApi } from './app';
import { createWorkspace } from './util/workspace';
import { wrapLegacyPrinter } from './printing/printer';
import {
  buildMockLogger,
  createPrecinctScannerStateMachineMock,
} from '../test/helpers/shared_helpers';
import { Player as AudioPlayer } from './audio/player';

const mockFeatureFlagger = getFeatureFlagMock();

vi.mock(import('@votingworks/utils'), async (importActual) => ({
  ...(await importActual()),
  isFeatureFlagEnabled: (flag) => mockFeatureFlagger.isEnabled(flag),
}));

vi.mock('./audio/player');

const mockAudioPlayer = vi.mocked(
  new AudioPlayer('development', mockLogger({ fn: vi.fn() }), 'pci.stereo')
);

const store = Store.memoryStore();
const workspace = createWorkspace(
  tmp.dirSync().name,
  mockBaseLogger({ fn: vi.fn }),
  {
    store,
  }
);
const mockUsbDrive = createMockUsbDrive();
const { printer } = createMockPrinterHandler();
const mockAuth = buildMockInsertedSmartCardAuth(vi.fn);
const electionDefinition = safeParseElectionDefinition(
  JSON.stringify(testCdfBallotDefinition)
).unsafeUnwrap();

afterEach(() => {
  workspace.reset();
});

runUiStringApiTests({
  api: buildApi({
    audioPlayer: mockAudioPlayer,
    auth: mockAuth,
    machine: createPrecinctScannerStateMachineMock(),
    workspace,
    usbDrive: mockUsbDrive.usbDrive,
    printer: wrapLegacyPrinter(printer),
    logger: buildMockLogger(mockAuth, workspace),
  }).methods(),
  store: store.getUiStringsStore(),
  afterEach,
  expect,
  test,
  resetAllMocks: vi.resetAllMocks,
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
        user: mockElectionManagerUser({
          electionKey: constructElectionKey(electionDefinition.election),
        }),
        sessionExpiresAt: mockSessionExpiresAt(),
      })
    );
  });

  const api = buildApi({
    audioPlayer: mockAudioPlayer,
    auth: mockAuth,
    machine: createPrecinctScannerStateMachineMock(),
    workspace,
    usbDrive: mockUsbDrive.usbDrive,
    printer: wrapLegacyPrinter(printer),
    logger: buildMockLogger(mockAuth, workspace),
  });

  runUiStringMachineConfigurationTests({
    electionDefinition,
    getMockUsbDrive: () => mockUsbDrive,
    runConfigureMachine: () =>
      api.methods().configureFromElectionPackageOnUsbDrive(),
    store: store.getUiStringsStore(),
    expect,
    test,
  });
});

describe('unconfigureElection', () => {
  const api = buildApi({
    audioPlayer: mockAudioPlayer,
    auth: mockAuth,
    machine: createPrecinctScannerStateMachineMock(),
    workspace,
    usbDrive: mockUsbDrive.usbDrive,
    printer: wrapLegacyPrinter(printer),
    logger: buildMockLogger(mockAuth, workspace),
  });

  runUiStringMachineDeconfigurationTests({
    runUnconfigureMachine: () => api.methods().unconfigureElection(),
    store: store.getUiStringsStore(),
    expect,
    test,
  });
});
