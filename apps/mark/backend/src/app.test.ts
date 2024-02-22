import { assert, find } from '@votingworks/basics';
import {
  electionFamousNames2021Fixtures,
  electionTwoPartyPrimaryFixtures,
  systemSettings,
} from '@votingworks/fixtures';
import {
  fakeElectionManagerUser,
  fakeSessionExpiresAt,
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
  Candidate,
  VotesDict,
  ContestId,
  YesNoVote,
  Election,
  safeParseElectionDefinitionExtended,
  testCdfBallotDefinition,
} from '@votingworks/types';
import {
  ALL_PRECINCTS_SELECTION,
  ELECTION_PACKAGE_FOLDER,
  BooleanEnvironmentVariableName,
  getFeatureFlagMock,
  singlePrecinctSelectionFor,
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
      user: fakeElectionManagerUser(electionDefinition),
      sessionExpiresAt: fakeSessionExpiresAt(),
    })
  );
}

beforeEach(() => {
  mockFeatureFlagger.enableFeatureFlag(
    BooleanEnvironmentVariableName.SKIP_ELECTION_PACKAGE_AUTHENTICATION
  );

  ({ apiClient, mockAuth, mockPrinterHandler, mockUsbDrive, server, logger } =
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

  usbDrive.eject.expectCallWith('unknown').resolves();
  await apiClient.ejectUsbDrive();

  mockElectionManagerAuth(electionFamousNames2021Fixtures.electionDefinition);
  usbDrive.eject.expectCallWith('election_manager').resolves();
  await apiClient.ejectUsbDrive();
});

async function expectElectionState(expected: Partial<ElectionState>) {
  expect(await apiClient.getElectionState()).toMatchObject(expected);
}

async function configureMachine(
  usbDrive: MockUsbDrive,
  electionDefinition: ElectionDefinition
) {
  mockElectionManagerAuth(electionDefinition);

  usbDrive.insertUsbDrive(
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

  usbDrive.removeUsbDrive();
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
});

/**
 * The VotesDict that the client sends to the server includes a full candidate
 * object to represent each candidate vote. For testing ease, this utility
 * converts a shorthand representation of votes to the full VotesDict.
 */
function convertShorthandVotesToVotesDict(
  shorthand: Record<ContestId, Array<string | Candidate>>,
  election: Election
): VotesDict {
  const votesDict: VotesDict = {};
  for (const [contestId, optionIds] of Object.entries(shorthand)) {
    const contest = find(election.contests, (c) => c.id === contestId);
    if (contest.type === 'yesno') {
      votesDict[contestId] = optionIds as YesNoVote;
    } else {
      const candidates = optionIds.map((optionId) => {
        if (typeof optionId === 'string') {
          return find(contest.candidates, (c) => c.id === optionId);
        }
        return optionId;
      });
      votesDict[contestId] = candidates;
    }
  }
  return votesDict;
}

test('printing ballots', async () => {
  mockElectionManagerAuth(electionDefinition);
  const electionPackage = safeParseElectionDefinitionExtended(
    JSON.stringify(testCdfBallotDefinition)
  ).unsafeUnwrap();
  mockUsbDrive.insertUsbDrive(
    await mockElectionPackageFileTree(electionPackage)
  );
  await expectElectionState({ ballotsPrintedCount: 0 });

  await configureMachine(
    mockUsbDrive,
    electionFamousNames2021Fixtures.electionDefinition
  );
  await apiClient.setPrecinctSelection({
    precinctSelection: ALL_PRECINCTS_SELECTION,
  });
  await apiClient.setPollsState({ pollsState: 'polls_open' });
  mockPrinterHandler.connectPrinter(HP_LASER_PRINTER_CONFIG);

  await apiClient.printBallot({
    precinctId: '23',
    ballotStyleId: '1',
    votes: convertShorthandVotesToVotesDict(
      {
        mayor: ['sherlock-holmes'],
        controller: ['oprah-winfrey'],
        attorney: ['john-snow'],
        'public-works-director': ['bill-nye'],
        'chief-of-police': ['natalie-portman'],
        'parks-and-recreation-director': ['stephen-hawking'],
        'board-of-alderman': [
          'helen-keller',
          'pablo-picasso',
          'nikola-tesla',
          'vincent-van-gogh',
        ],
        'city-council': [
          'marie-curie',
          'mona-lisa',
          'harriet-tubman',
          'tim-allen',
        ],
      },
      electionFamousNames2021Fixtures.election
    ),
  });

  await expect(mockPrinterHandler.getLastPrintPath()).toMatchPdfSnapshot();
  await expectElectionState({ ballotsPrintedCount: 1 });
});
