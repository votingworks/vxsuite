import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { makeTemporaryDirectory } from '@votingworks/fixtures';

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
import { mockBaseLogger } from '@votingworks/logging';
import { createMockFujitsuPrinterHandler } from '@votingworks/fujitsu-thermal-printer';
import { Store } from './store.js';
import { buildApi } from './app.js';
import { createWorkspace, type Workspace } from './util/workspace.js';
import {
  buildMockLogger,
  createPrecinctScannerStateMachineMock,
} from '../test/helpers/shared_helpers.js';
import { type AudioPlayer, getMockAudioPlayer } from './audio/audio.js';

const mockFeatureFlagger = getFeatureFlagMock();

vi.mock(import('@votingworks/utils'), async (importActual) => ({
  ...(await importActual()),
  isFeatureFlagEnabled: (flag) => mockFeatureFlagger.isEnabled(flag),
}));

const mockAudioPlayer = getMockAudioPlayer() as AudioPlayer;

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

const mockUsbDrive = createMockUsbDrive();
const { printer } = createMockFujitsuPrinterHandler();
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
      audioPlayer: mockAudioPlayer,
      auth: mockAuth,
      machine: createPrecinctScannerStateMachineMock(),
      workspace,
      usbDrive: mockUsbDrive.usbDrive,
      printer,
      logger: buildMockLogger(mockAuth, workspace),
    }).methods(),
  store: store.getUiStringsStore(),
  beforeEach,
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

  runUiStringMachineConfigurationTests({
    electionDefinition,
    getMockUsbDrive: () => mockUsbDrive,
    runConfigureMachine: () =>
      buildApi({
        audioPlayer: mockAudioPlayer,
        auth: mockAuth,
        machine: createPrecinctScannerStateMachineMock(),
        workspace,
        usbDrive: mockUsbDrive.usbDrive,
        printer,
        logger: buildMockLogger(mockAuth, workspace),
      })
        .methods()
        .configureFromElectionPackageOnUsbDrive(),
    store: store.getUiStringsStore(),
    expect,
    test,
  });
});

describe('unconfigureElection', () => {
  runUiStringMachineDeconfigurationTests({
    runUnconfigureMachine: () =>
      buildApi({
        audioPlayer: mockAudioPlayer,
        auth: mockAuth,
        machine: createPrecinctScannerStateMachineMock(),
        workspace,
        usbDrive: mockUsbDrive.usbDrive,
        printer,
        logger: buildMockLogger(mockAuth, workspace),
      })
        .methods()
        .unconfigureElection(),
    store: store.getUiStringsStore(),
    expect,
    test,
  });
});
