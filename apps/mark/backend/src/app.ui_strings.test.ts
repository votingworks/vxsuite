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
import { createWorkspace, Workspace } from './util/workspace';
import { Api, buildApi } from './app';
import { buildMockLogger } from '../test/app_helpers';
import { Player as AudioPlayer } from './audio/player';

const mockFeatureFlagger = getFeatureFlagMock();

vi.mock(import('@votingworks/utils'), async (importActual) => ({
  ...(await importActual()),
  isFeatureFlagEnabled: (flag) => mockFeatureFlagger.isEnabled(flag),
}));

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
  api: () => {
    const logger = buildMockLogger(mockAuth, workspace);

    return buildApi({
      audioPlayer: vi.mocked(
        new AudioPlayer('development', logger, 'pci.stereo')
      ),
      auth: mockAuth,
      usbDrive: createMockUsbDrive().usbDrive,
      printer: createMockPrinterHandler().printer,
      logger,
      workspace,
    }).methods();
  },
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
    mockFeatureFlagger.resetFeatureFlags();
    mockFeatureFlagger.enableFeatureFlag(
      BooleanEnvironmentVariableName.SKIP_ELECTION_PACKAGE_AUTHENTICATION
    );

    const logger = buildMockLogger(mockAuth, workspace);

    mockUsbDrive = createMockUsbDrive();
    api = buildApi({
      audioPlayer: vi.mocked(
        new AudioPlayer('development', logger, 'pci.stereo')
      ),
      auth: mockAuth,
      usbDrive: mockUsbDrive.usbDrive,
      printer: createMockPrinterHandler().printer,
      logger,
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
    runUnconfigureMachine: () => {
      const logger = buildMockLogger(mockAuth, workspace);

      const api = buildApi({
        audioPlayer: vi.mocked(
          new AudioPlayer('development', logger, 'pci.stereo')
        ),
        auth: mockAuth,
        usbDrive: createMockUsbDrive().usbDrive,
        printer: createMockPrinterHandler().printer,
        logger,
        workspace,
      }).methods();

      return api.unconfigureMachine();
    },
    store: store.getUiStringsStore(),
    expect,
    test,
  });
});
