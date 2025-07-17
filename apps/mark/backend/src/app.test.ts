import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { err } from '@votingworks/basics';
import {
  electionFamousNames2021Fixtures,
  electionGeneralFixtures,
  electionTwoPartyPrimaryFixtures,
  systemSettings,
} from '@votingworks/fixtures';
import {
  mockElectionManagerUser,
  mockPollWorkerUser,
  mockSessionExpiresAt,
  suppressingConsoleOutput,
} from '@votingworks/test-utils';
import { InsertedSmartCardAuthApi } from '@votingworks/auth';
import {
  safeParseSystemSettings,
  DEFAULT_SYSTEM_SETTINGS,
  safeParseJson,
  SystemSettingsSchema,
  ElectionDefinition,
  PrinterStatus,
  UiStringsPackage,
  constructElectionKey,
  convertVxfElectionToCdfBallotDefinition,
  safeParseElectionDefinition,
  DEV_MACHINE_ID,
} from '@votingworks/types';
import {
  ALL_PRECINCTS_SELECTION,
  ELECTION_PACKAGE_FOLDER,
  BooleanEnvironmentVariableName,
  getFeatureFlagMock,
  singlePrecinctSelectionFor,
  getMockMultiLanguageElectionDefinition,
  generateMockVotes,
} from '@votingworks/utils';

import { Buffer } from 'node:buffer';
import { mockElectionPackageFileTree } from '@votingworks/backend';
import { Server } from 'node:http';
import * as grout from '@votingworks/grout';
import { MockUsbDrive } from '@votingworks/usb-drive';
import { LogEventId, Logger } from '@votingworks/logging';
import {
  HP_LASER_PRINTER_CONFIG,
  MemoryPrinterHandler,
} from '@votingworks/printing';
import { createApp } from '../test/app_helpers';
import { Api } from './app';
import { ElectionState, PrintMode } from '.';
import { isAccessibleControllerAttached } from './util/accessible_controller';

const electionGeneralDefinition =
  electionGeneralFixtures.readElectionDefinition();
const { election: electionGeneral } = electionGeneralDefinition;
const mockFeatureFlagger = getFeatureFlagMock();

vi.mock(import('@votingworks/utils'), async (importActual) => ({
  ...(await importActual()),
  isFeatureFlagEnabled: (flag) => mockFeatureFlagger.isEnabled(flag),
}));

vi.mock(import('./util/accessible_controller.js'), async (importActual) => ({
  ...(await importActual()),
  isAccessibleControllerAttached: vi.fn().mockResolvedValue(true),
}));

let apiClient: grout.Client<Api>;
let logger: Logger;
let mockAuth: InsertedSmartCardAuthApi;
let mockUsbDrive: MockUsbDrive;
let mockPrinterHandler: MemoryPrinterHandler;
let server: Server;

function mockElectionManagerAuth(electionDefinition: ElectionDefinition) {
  vi.mocked(mockAuth.getAuthStatus).mockImplementation(() =>
    Promise.resolve({
      status: 'logged_in',
      user: mockElectionManagerUser({
        electionKey: constructElectionKey(electionDefinition.election),
      }),
      sessionExpiresAt: mockSessionExpiresAt(),
    })
  );
}

function mockPollWorkerAuth(electionDefinition: ElectionDefinition) {
  vi.mocked(mockAuth.getAuthStatus).mockImplementation(() =>
    Promise.resolve({
      status: 'logged_in',
      user: mockPollWorkerUser({
        electionKey: constructElectionKey(electionDefinition.election),
      }),
      sessionExpiresAt: mockSessionExpiresAt(),
    })
  );
}

function mockNoCard() {
  vi.mocked(mockAuth.getAuthStatus).mockImplementation(() =>
    Promise.resolve({
      status: 'logged_out',
      reason: 'no_card',
    })
  );
}

beforeEach(() => {
  mockFeatureFlagger.enableFeatureFlag(
    BooleanEnvironmentVariableName.SKIP_ELECTION_PACKAGE_AUTHENTICATION
  );

  ({ apiClient, mockAuth, mockUsbDrive, mockPrinterHandler, server, logger } =
    createApp());
});

afterEach(() => {
  server?.close();
});

test('uses machine config from env', async () => {
  const originalEnv = process.env;
  process.env = {
    ...originalEnv,
    VX_MACHINE_ID: 'test-machine-id',
    VX_CODE_VERSION: 'test-code-version',
    VX_SCREEN_ORIENTATION: 'landscape',
  };

  expect(await apiClient.getMachineConfig()).toEqual({
    machineId: 'test-machine-id',
    codeVersion: 'test-code-version',
    screenOrientation: 'landscape',
  });

  process.env = originalEnv;
});

test('uses default machine config if not set', async () => {
  expect(await apiClient.getMachineConfig()).toEqual({
    machineId: DEV_MACHINE_ID,
    codeVersion: 'dev',
    screenOrientation: 'portrait',
  });
});

test('configureElectionPackageFromUsb reads to and writes from store', async () => {
  const electionDefinition =
    electionFamousNames2021Fixtures.readElectionDefinition();

  mockElectionManagerAuth(electionDefinition);

  mockUsbDrive.insertUsbDrive(
    await mockElectionPackageFileTree({
      electionDefinition,
      systemSettings: safeParseJson(
        systemSettings.asText(),
        SystemSettingsSchema
      ).unsafeUnwrap(),
    })
  );

  (await apiClient.configureElectionPackageFromUsb()).unsafeUnwrap();
  expect(logger.logAsCurrentRole).toHaveBeenLastCalledWith(
    LogEventId.ElectionConfigured,
    expect.objectContaining({
      disposition: 'success',
    })
  );

  const readResult = await apiClient.getSystemSettings();
  expect(readResult).toEqual(
    safeParseSystemSettings(systemSettings.asText()).unsafeUnwrap()
  );
  const electionRecord = await apiClient.getElectionRecord();
  expect(electionRecord).toEqual({
    electionDefinition,
    electionPackageHash: expect.any(String),
  });
});

test('unconfigureMachine deletes system settings and election definition', async () => {
  const electionDefinition =
    electionFamousNames2021Fixtures.readElectionDefinition();

  mockElectionManagerAuth(electionDefinition);

  mockUsbDrive.insertUsbDrive(
    await mockElectionPackageFileTree({
      electionDefinition,
      systemSettings: safeParseJson(
        systemSettings.asText(),
        SystemSettingsSchema
      ).unsafeUnwrap(),
    })
  );

  (await apiClient.configureElectionPackageFromUsb()).unsafeUnwrap();
  await apiClient.unconfigureMachine();
  expect(logger.logAsCurrentRole).toHaveBeenLastCalledWith(
    LogEventId.ElectionUnconfigured,
    expect.objectContaining({
      disposition: 'success',
    })
  );

  const readResult = await apiClient.getSystemSettings();
  expect(readResult).toEqual(DEFAULT_SYSTEM_SETTINGS);
  const electionRecord = await apiClient.getElectionRecord();
  expect(electionRecord).toBeNull();
});

test('configureElectionPackageFromUsb throws when no USB drive mounted', async () => {
  const electionDefinition =
    electionFamousNames2021Fixtures.readElectionDefinition();
  mockElectionManagerAuth(electionDefinition);

  mockUsbDrive.usbDrive.status
    .expectCallWith()
    .resolves({ status: 'no_drive' });
  await suppressingConsoleOutput(async () => {
    await expect(apiClient.configureElectionPackageFromUsb()).rejects.toThrow(
      'No USB drive mounted'
    );
  });
});

test('configureElectionPackageFromUsb returns an error if election package parsing fails', async () => {
  // Lack of auth will cause election package reading to throw
  vi.mocked(mockAuth.getAuthStatus).mockImplementation(() =>
    Promise.resolve({
      status: 'logged_out',
      reason: 'no_card',
    })
  );

  mockUsbDrive.insertUsbDrive({
    'some-election': {
      [ELECTION_PACKAGE_FOLDER]: {
        'test-election-package.zip': Buffer.from("doesn't matter"),
      },
    },
  });

  const result = await apiClient.configureElectionPackageFromUsb();
  expect(result).toEqual(err('auth_required_before_election_package_load'));
  expect(logger.logAsCurrentRole).toHaveBeenLastCalledWith(
    LogEventId.ElectionConfigured,
    expect.objectContaining({
      disposition: 'failure',
    })
  );
});

test('configure with CDF election', async () => {
  const cdfElection = convertVxfElectionToCdfBallotDefinition(electionGeneral);
  const cdfElectionDefinition = safeParseElectionDefinition(
    JSON.stringify(cdfElection)
  ).unsafeUnwrap();
  mockElectionManagerAuth(cdfElectionDefinition);

  mockUsbDrive.insertUsbDrive(
    await mockElectionPackageFileTree({
      electionDefinition: cdfElectionDefinition,
      systemSettings: safeParseJson(
        systemSettings.asText(),
        SystemSettingsSchema
      ).unsafeUnwrap(),
    })
  );

  (await apiClient.configureElectionPackageFromUsb()).unsafeUnwrap();

  const electionRecord = await apiClient.getElectionRecord();
  expect(electionRecord?.electionDefinition.election.id).toEqual(
    electionGeneral.id
  );

  // Ensure loading auth election key from db works
  expect(await apiClient.getAuthStatus()).toMatchObject({
    status: 'logged_in',
  });
});

test('usbDrive', async () => {
  const { usbDrive } = mockUsbDrive;

  usbDrive.status.expectCallWith().resolves({ status: 'no_drive' });
  expect(await apiClient.getUsbDriveStatus()).toEqual({
    status: 'no_drive',
  });

  usbDrive.eject.expectCallWith().resolves();
  await apiClient.ejectUsbDrive();

  mockElectionManagerAuth(
    electionFamousNames2021Fixtures.readElectionDefinition()
  );
  usbDrive.eject.expectCallWith().resolves();
  await apiClient.ejectUsbDrive();
});

async function expectElectionState(expected: Partial<ElectionState>) {
  expect(await apiClient.getElectionState()).toMatchObject(expected);
}

async function configureMachine(
  usbDrive: MockUsbDrive,
  electionDefinition: ElectionDefinition,
  uiStrings?: UiStringsPackage
) {
  mockElectionManagerAuth(electionDefinition);

  usbDrive.insertUsbDrive(
    await mockElectionPackageFileTree({
      electionDefinition,
      systemSettings: safeParseJson(
        systemSettings.asText(),
        SystemSettingsSchema
      ).unsafeUnwrap(),
      uiStrings,
    })
  );

  (await apiClient.configureElectionPackageFromUsb()).unsafeUnwrap();

  usbDrive.removeUsbDrive();
  mockNoCard();
}

test('single precinct election automatically has precinct set on configure', async () => {
  await configureMachine(
    mockUsbDrive,
    electionTwoPartyPrimaryFixtures.makeSinglePrecinctElectionDefinition()
  );

  await expectElectionState({
    precinctSelection: singlePrecinctSelectionFor('precinct-1'),
  });
});

test('polls state', async () => {
  await expectElectionState({ pollsState: 'polls_closed_initial' });

  await configureMachine(
    mockUsbDrive,
    electionFamousNames2021Fixtures.readElectionDefinition()
  );
  await expectElectionState({ pollsState: 'polls_closed_initial' });

  mockPollWorkerAuth(electionFamousNames2021Fixtures.readElectionDefinition());
  await apiClient.setPollsState({ pollsState: 'polls_open' });
  expect(logger.log).toHaveBeenLastCalledWith(
    LogEventId.PollsOpened,
    'poll_worker',
    { disposition: 'success' }
  );
  await expectElectionState({ pollsState: 'polls_open' });

  await apiClient.setPollsState({ pollsState: 'polls_paused' });
  expect(logger.log).toHaveBeenLastCalledWith(
    LogEventId.VotingPaused,
    'poll_worker',
    { disposition: 'success' }
  );
  await expectElectionState({ pollsState: 'polls_paused' });

  await apiClient.setPollsState({ pollsState: 'polls_open' });
  expect(logger.log).toHaveBeenLastCalledWith(
    LogEventId.VotingResumed,
    'poll_worker',
    { disposition: 'success' }
  );
  await expectElectionState({ pollsState: 'polls_open' });

  await apiClient.setPollsState({ pollsState: 'polls_closed_final' });
  expect(logger.log).toHaveBeenLastCalledWith(
    LogEventId.PollsClosed,
    'poll_worker',
    { disposition: 'success' }
  );
  await expectElectionState({ pollsState: 'polls_closed_final' });

  // system admin resetting polls to paused
  await apiClient.setPollsState({ pollsState: 'polls_paused' });
  await expectElectionState({ pollsState: 'polls_paused' });
});

test('"test" mode', async () => {
  await expectElectionState({ isTestMode: true });

  await configureMachine(
    mockUsbDrive,
    electionFamousNames2021Fixtures.readElectionDefinition()
  );

  await apiClient.setTestMode({ isTestMode: false });
  await expectElectionState({ isTestMode: false });

  await apiClient.setTestMode({ isTestMode: true });
  await expectElectionState({ isTestMode: true });
});

test('setting precinct', async () => {
  expect(
    (await apiClient.getElectionState()).precinctSelection
  ).toBeUndefined();

  await configureMachine(
    mockUsbDrive,
    electionFamousNames2021Fixtures.readElectionDefinition()
  );
  expect(
    (await apiClient.getElectionState()).precinctSelection
  ).toBeUndefined();

  await apiClient.setPrecinctSelection({
    precinctSelection: ALL_PRECINCTS_SELECTION,
  });
  await expectElectionState({
    precinctSelection: ALL_PRECINCTS_SELECTION,
  });

  const singlePrecinctSelection = singlePrecinctSelectionFor('23');
  await apiClient.setPrecinctSelection({
    precinctSelection: singlePrecinctSelection,
  });
  await expectElectionState({
    precinctSelection: singlePrecinctSelection,
  });
  expect(logger.logAsCurrentRole).toHaveBeenLastCalledWith(
    LogEventId.PrecinctConfigurationChanged,
    {
      disposition: 'success',
      message: 'User set the precinct for the machine to North Lincoln',
    }
  );
});

test('printer status', async () => {
  expect(await apiClient.getPrinterStatus()).toEqual<PrinterStatus>({
    connected: false,
  });

  mockPrinterHandler.connectPrinter(HP_LASER_PRINTER_CONFIG);
  expect(await apiClient.getPrinterStatus()).toMatchObject<PrinterStatus>({
    connected: true,
    config: HP_LASER_PRINTER_CONFIG,
  });

  mockPrinterHandler.disconnectPrinter();
  expect(await apiClient.getPrinterStatus()).toEqual<PrinterStatus>({
    connected: false,
  });
});

test('printing ballots', async () => {
  const electionDefinition = getMockMultiLanguageElectionDefinition(
    electionGeneralDefinition,
    ['en', 'zh-Hans']
  );
  mockPrinterHandler.connectPrinter(HP_LASER_PRINTER_CONFIG);
  await configureMachine(
    mockUsbDrive,
    electionDefinition,
    electionGeneralFixtures.uiStrings
  );

  await expectElectionState({ ballotsPrintedCount: 0 });

  // vote a ballot in English
  const mockVotes = generateMockVotes(electionDefinition.election);
  await apiClient.printBallot({
    precinctId: '21',
    ballotStyleId: electionDefinition.election.ballotStyles.find(
      (bs) => bs.languages?.includes('en')
    )!.id,
    votes: mockVotes,
    languageCode: 'en',
  });

  await expectElectionState({ ballotsPrintedCount: 1 });
  await expect(mockPrinterHandler.getLastPrintPath()).toMatchPdfSnapshot({
    customSnapshotIdentifier: 'english-ballot',
    failureThreshold: 0.0001,
  });

  // vote a ballot in Chinese
  await apiClient.printBallot({
    precinctId: '21',
    ballotStyleId: electionDefinition.election.ballotStyles.find(
      (bs) => bs.languages?.includes('zh-Hans')
    )!.id,
    votes: mockVotes,
    languageCode: 'zh-Hans',
  });

  await expectElectionState({ ballotsPrintedCount: 2 });
  await expect(mockPrinterHandler.getLastPrintPath()).toMatchPdfSnapshot({
    customSnapshotIdentifier: 'chinese-ballot',
    failureThreshold: 0.0001,
  });
});

test('getAccessibleControllerConnected', async () => {
  const isAccessibleControllerAttachedMock = vi.mocked(
    isAccessibleControllerAttached
  );

  isAccessibleControllerAttachedMock.mockReturnValue(true);
  expect(await apiClient.getAccessibleControllerConnected()).toEqual(true);

  isAccessibleControllerAttachedMock.mockReturnValue(false);
  expect(await apiClient.getAccessibleControllerConnected()).toEqual(false);
});

test('print mode get and set', async () => {
  expect(await apiClient.getPrintMode()).toEqual<PrintMode>('summary');

  await configureMachine(
    mockUsbDrive,
    electionFamousNames2021Fixtures.readElectionDefinition()
  );
  await apiClient.setPrintMode({ mode: 'bubble_marks' });

  expect(await apiClient.getPrintMode()).toEqual<PrintMode>('bubble_marks');
});
