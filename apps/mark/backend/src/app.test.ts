import { assert } from '@votingworks/basics';
import {
  electionFamousNames2021Fixtures,
  electionGeneralDefinition,
  electionGeneralFixtures,
  electionTwoPartyPrimaryFixtures,
  systemSettings,
} from '@votingworks/fixtures';
import {
  mockElectionManagerUser,
  mockPollWorkerUser,
  mockSessionExpiresAt,
  mockOf,
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
  LanguageCode,
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

import { Buffer } from 'buffer';
import { mockElectionPackageFileTree } from '@votingworks/backend';
import { Server } from 'http';
import * as grout from '@votingworks/grout';
import { MockUsbDrive } from '@votingworks/usb-drive';
import { LogEventId, Logger } from '@votingworks/logging';
import {
  HP_LASER_PRINTER_CONFIG,
  MemoryPrinterHandler,
} from '@votingworks/printing';
import { createApp } from '../test/app_helpers';
import { Api } from './app';
import { ElectionState } from '.';

const mockFeatureFlagger = getFeatureFlagMock();

jest.mock('@votingworks/utils', (): typeof import('@votingworks/utils') => {
  return {
    ...jest.requireActual('@votingworks/utils'),
    isFeatureFlagEnabled: (flag) => mockFeatureFlagger.isEnabled(flag),
    randomBallotId: () => '12345',
  };
});

let apiClient: grout.Client<Api>;
let logger: Logger;
let mockAuth: InsertedSmartCardAuthApi;
let mockUsbDrive: MockUsbDrive;
let mockPrinterHandler: MemoryPrinterHandler;
let server: Server;

function mockElectionManagerAuth(electionDefinition: ElectionDefinition) {
  mockOf(mockAuth.getAuthStatus).mockImplementation(() =>
    Promise.resolve({
      status: 'logged_in',
      user: mockElectionManagerUser(electionDefinition),
      sessionExpiresAt: mockSessionExpiresAt(),
    })
  );
}

function mockPollWorkerAuth(electionDefinition: ElectionDefinition) {
  mockOf(mockAuth.getAuthStatus).mockImplementation(() =>
    Promise.resolve({
      status: 'logged_in',
      user: mockPollWorkerUser(electionDefinition),
      sessionExpiresAt: mockSessionExpiresAt(),
    })
  );
}

function mockNoCard() {
  mockOf(mockAuth.getAuthStatus).mockImplementation(() =>
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
    machineId: '0000',
    codeVersion: 'dev',
    screenOrientation: 'portrait',
  });
});

test('configureElectionPackageFromUsb reads to and writes from store', async () => {
  const { electionDefinition } = electionFamousNames2021Fixtures;

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

  const writeResult = await apiClient.configureElectionPackageFromUsb();
  assert(writeResult.isOk());

  const readResult = await apiClient.getSystemSettings();
  expect(readResult).toEqual(
    safeParseSystemSettings(systemSettings.asText()).unsafeUnwrap()
  );
  const electionDefinitionResult = await apiClient.getElectionDefinition();
  expect(electionDefinitionResult).toEqual(electionDefinition);
});

test('unconfigureMachine deletes system settings and election definition', async () => {
  const { electionDefinition } = electionFamousNames2021Fixtures;

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

  const writeResult = await apiClient.configureElectionPackageFromUsb();
  assert(writeResult.isOk());
  await apiClient.unconfigureMachine();

  const readResult = await apiClient.getSystemSettings();
  expect(readResult).toEqual(DEFAULT_SYSTEM_SETTINGS);
  const electionDefinitionResult = await apiClient.getElectionDefinition();
  expect(electionDefinitionResult).toBeNull();
});

test('configureElectionPackageFromUsb throws when no USB drive mounted', async () => {
  const { electionDefinition } = electionFamousNames2021Fixtures;
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
  mockOf(mockAuth.getAuthStatus).mockImplementation(() =>
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
  assert(result.isErr());
  expect(result.err()).toEqual('auth_required_before_election_package_load');
});

test('usbDrive', async () => {
  const { usbDrive } = mockUsbDrive;

  usbDrive.status.expectCallWith().resolves({ status: 'no_drive' });
  expect(await apiClient.getUsbDriveStatus()).toEqual({
    status: 'no_drive',
  });

  usbDrive.eject.expectCallWith().resolves();
  await apiClient.ejectUsbDrive();

  mockElectionManagerAuth(electionFamousNames2021Fixtures.electionDefinition);
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

  const writeResult = await apiClient.configureElectionPackageFromUsb();
  assert(writeResult.isOk());

  usbDrive.removeUsbDrive();
  mockNoCard();
}

test('single precinct election automatically has precinct set on configure', async () => {
  await configureMachine(
    mockUsbDrive,
    electionTwoPartyPrimaryFixtures.singlePrecinctElectionDefinition
  );

  await expectElectionState({
    precinctSelection: singlePrecinctSelectionFor('precinct-1'),
  });
});

test('polls state', async () => {
  await expectElectionState({ pollsState: 'polls_closed_initial' });

  await configureMachine(
    mockUsbDrive,
    electionFamousNames2021Fixtures.electionDefinition
  );
  await expectElectionState({ pollsState: 'polls_closed_initial' });

  mockPollWorkerAuth(electionFamousNames2021Fixtures.electionDefinition);
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

test('test mode', async () => {
  await expectElectionState({ isTestMode: true });

  await configureMachine(
    mockUsbDrive,
    electionFamousNames2021Fixtures.electionDefinition
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
    electionFamousNames2021Fixtures.electionDefinition
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
    [LanguageCode.ENGLISH, LanguageCode.CHINESE_SIMPLIFIED]
  );
  mockPrinterHandler.connectPrinter(HP_LASER_PRINTER_CONFIG);
  await configureMachine(
    mockUsbDrive,
    electionDefinition,
    electionGeneralFixtures.ELECTION_GENERAL_TEST_UI_STRINGS_CHINESE_SIMPLIFIED
  );

  await expectElectionState({ ballotsPrintedCount: 0 });

  // vote a ballot in English
  const mockVotes = generateMockVotes(electionDefinition.election);
  await apiClient.printBallot({
    precinctId: '21',
    ballotStyleId: electionDefinition.election.ballotStyles.find(
      (bs) => bs.languages?.includes(LanguageCode.ENGLISH)
    )!.id,
    votes: mockVotes,
    languageCode: LanguageCode.ENGLISH,
  });

  await expectElectionState({ ballotsPrintedCount: 1 });
  await expect(mockPrinterHandler.getLastPrintPath()).toMatchPdfSnapshot({
    customSnapshotIdentifier: 'english-ballot',
  });

  // vote a ballot in Chinese
  await apiClient.printBallot({
    precinctId: '21',
    ballotStyleId: electionDefinition.election.ballotStyles.find(
      (bs) => bs.languages?.includes(LanguageCode.CHINESE_SIMPLIFIED)
    )!.id,
    votes: mockVotes,
    languageCode: LanguageCode.CHINESE_SIMPLIFIED,
  });

  await expectElectionState({ ballotsPrintedCount: 2 });
  await expect(mockPrinterHandler.getLastPrintPath()).toMatchPdfSnapshot({
    customSnapshotIdentifier: 'chinese-ballot',
  });
});
