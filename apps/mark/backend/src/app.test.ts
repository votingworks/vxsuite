import { assert, err, ok, Optional, Result } from '@votingworks/basics';
import {
  electionFamousNames2021Fixtures,
  electionSampleDefinition,
  systemSettings,
} from '@votingworks/fixtures';
import {
  fakeElectionManagerUser,
  fakePollWorkerUser,
  fakeSessionExpiresAt,
  mockOf,
} from '@votingworks/test-utils';
import { ElectionDefinition } from '@votingworks/types';
import { DEV_JURISDICTION, InsertedSmartCardAuthApi } from '@votingworks/auth';
import {
  ALL_PRECINCTS_SELECTION,
  ReportSourceMachineType,
  safeParseSystemSettings,
  ScannerReportData,
  ScannerReportDataSchema,
} from '@votingworks/utils';

import { Buffer } from 'buffer';
import {
  createBallotPackageWithoutTemplates,
  MockUsb,
} from '@votingworks/backend';
import { Server } from 'http';
import * as grout from '@votingworks/grout';
import { DEFAULT_SYSTEM_SETTINGS } from '@votingworks/types';
import { createApp } from '../test/app_helpers';
import { Api } from './app';

let apiClient: grout.Client<Api>;
let mockAuth: InsertedSmartCardAuthApi;
let mockUsb: MockUsb;
let server: Server;

beforeEach(() => {
  ({ apiClient, mockAuth, mockUsb, server } = createApp());
});

afterEach(() => {
  server?.close();
});

const jurisdiction = DEV_JURISDICTION;

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

<<<<<<< HEAD
test('read election definition from card', async () => {
  const { electionDefinition } = electionFamousNames2021Fixtures;
  const { electionData, electionHash } = electionDefinition;

  mockOf(mockAuth.readCardDataAsString).mockImplementation(() =>
    Promise.resolve(ok(electionData))
  );

  let result: Result<ElectionDefinition, Error>;

  mockOf(mockAuth.getAuthStatus).mockImplementation(() =>
    Promise.resolve({ status: 'logged_out', reason: 'no_card' })
  );
  result = await apiClient.readElectionDefinitionFromCard({ electionHash });
  expect(result).toEqual(err(new Error('User is not logged in')));

  mockOf(mockAuth.getAuthStatus).mockImplementation(() =>
    Promise.resolve({
      status: 'logged_in',
      user: fakePollWorkerUser(electionDefinition),
      sessionExpiresAt: fakeSessionExpiresAt(),
    })
  );
  result = await apiClient.readElectionDefinitionFromCard({ electionHash });
  expect(result).toEqual(err(new Error('User is not an election manager')));

  mockOf(mockAuth.getAuthStatus).mockImplementation(() =>
    Promise.resolve({
      status: 'logged_in',
      user: fakeElectionManagerUser(electionDefinition),
      sessionExpiresAt: fakeSessionExpiresAt(),
    })
  );
  result = await apiClient.readElectionDefinitionFromCard({ electionHash });
  expect(result).toEqual(ok(electionDefinition));
  expect(mockAuth.readCardDataAsString).toHaveBeenCalledTimes(1);
  expect(mockAuth.readCardDataAsString).toHaveBeenNthCalledWith(1, {
    electionHash,
    jurisdiction,
  });

  mockOf(mockAuth.readCardDataAsString).mockImplementation(() =>
    Promise.resolve(ok(undefined))
  );
  result = await apiClient.readElectionDefinitionFromCard({ electionHash });
  expect(result).toEqual(
    err(new Error('Unable to read election definition from card'))
  );
  expect(mockAuth.readCardDataAsString).toHaveBeenCalledTimes(2);
  expect(mockAuth.readCardDataAsString).toHaveBeenNthCalledWith(2, {
    electionHash,
    jurisdiction,
=======
test('auth', async () => {
  const { electionDefinition } = electionFamousNames2021Fixtures;
  const { electionHash } = electionDefinition;
  await apiClient.getAuthStatus({ electionHash });
  expect(mockAuth.getAuthStatus).toHaveBeenCalledTimes(1);
  expect(mockAuth.getAuthStatus).toHaveBeenNthCalledWith(1, {
    electionHash,
  });

  await apiClient.checkPin({ electionHash, pin: '123456' });
  expect(mockAuth.checkPin).toHaveBeenCalledTimes(1);
  expect(mockAuth.checkPin).toHaveBeenNthCalledWith(
    1,
    { electionHash },
    { pin: '123456' }
  );

  await apiClient.updateSessionExpiry({
    electionHash,
    sessionExpiresAt: new Date().getTime() + 60 * 1000,
  });
  expect(mockAuth.updateSessionExpiry).toHaveBeenCalledTimes(1);
  expect(mockAuth.updateSessionExpiry).toHaveBeenNthCalledWith(
    1,
    { electionHash },
    { sessionExpiresAt: expect.any(Number) }
  );

  await apiClient.logOut({ electionHash });
  expect(mockAuth.logOut).toHaveBeenCalledTimes(1);
  expect(mockAuth.logOut).toHaveBeenNthCalledWith(1, { electionHash });

  await apiClient.startCardlessVoterSession({
    electionHash,
    ballotStyleId: 'b1',
    precinctId: 'p1',
  });
  expect(mockAuth.startCardlessVoterSession).toHaveBeenCalledTimes(1);
  expect(mockAuth.startCardlessVoterSession).toHaveBeenNthCalledWith(
    1,
    { electionHash },
    { ballotStyleId: 'b1', precinctId: 'p1' }
  );

  await apiClient.endCardlessVoterSession({ electionHash });
  expect(mockAuth.endCardlessVoterSession).toHaveBeenCalledTimes(1);
  expect(mockAuth.endCardlessVoterSession).toHaveBeenNthCalledWith(1, {
    electionHash,
>>>>>>> 5db5c368f (update tests pt 4)
  });
});

test('read scanner report data from card', async () => {
  const { electionDefinition } = electionFamousNames2021Fixtures;
  const { electionHash } = electionDefinition;

  const scannerReportData: ScannerReportData = {
    ballotCounts: {},
    isLiveMode: false,
    machineId: '0000',
    pollsTransition: 'close_polls',
    precinctSelection: ALL_PRECINCTS_SELECTION,
    tally: [],
    tallyMachineType: ReportSourceMachineType.PRECINCT_SCANNER,
    timePollsTransitioned: 0,
    timeSaved: 0,
    totalBallotsScanned: 0,
  };
  mockOf(mockAuth.readCardData).mockImplementation(() =>
    Promise.resolve(ok(scannerReportData))
  );

  let result: Result<Optional<ScannerReportData>, Error>;

  mockOf(mockAuth.getAuthStatus).mockImplementation(() =>
    Promise.resolve({ status: 'logged_out', reason: 'no_card' })
  );
  result = await apiClient.readScannerReportDataFromCard({ electionHash });
  expect(result).toEqual(err(new Error('User is not logged in')));

  mockOf(mockAuth.getAuthStatus).mockImplementation(() =>
    Promise.resolve({
      status: 'logged_in',
      user: fakeElectionManagerUser(electionDefinition),
      sessionExpiresAt: fakeSessionExpiresAt(),
    })
  );
  result = await apiClient.readScannerReportDataFromCard({ electionHash });
  expect(result).toEqual(err(new Error('User is not a poll worker')));

  mockOf(mockAuth.getAuthStatus).mockImplementation(() =>
    Promise.resolve({
      status: 'logged_in',
      user: fakePollWorkerUser(electionDefinition),
      sessionExpiresAt: fakeSessionExpiresAt(),
    })
  );
  result = await apiClient.readScannerReportDataFromCard({ electionHash });
  expect(result).toEqual(ok(scannerReportData));
  expect(mockAuth.readCardData).toHaveBeenCalledTimes(1);
  expect(mockAuth.readCardData).toHaveBeenNthCalledWith(
    1,
    { electionHash, jurisdiction },
    { schema: ScannerReportDataSchema }
  );
});

test('clear scanner report data from card', async () => {
  const { electionDefinition } = electionFamousNames2021Fixtures;
  const { electionHash } = electionDefinition;

  mockOf(mockAuth.clearCardData).mockImplementation(() =>
    Promise.resolve(ok())
  );

  let result: Result<void, Error>;

  mockOf(mockAuth.getAuthStatus).mockImplementation(() =>
    Promise.resolve({ status: 'logged_out', reason: 'no_card' })
  );
  result = await apiClient.clearScannerReportDataFromCard({ electionHash });
  expect(result).toEqual(err(new Error('User is not logged in')));

  mockOf(mockAuth.getAuthStatus).mockImplementation(() =>
    Promise.resolve({
      status: 'logged_in',
      user: fakeElectionManagerUser(electionDefinition),
      sessionExpiresAt: fakeSessionExpiresAt(),
    })
  );
  result = await apiClient.clearScannerReportDataFromCard({ electionHash });
  expect(result).toEqual(err(new Error('User is not a poll worker')));

  mockOf(mockAuth.getAuthStatus).mockImplementation(() =>
    Promise.resolve({
      status: 'logged_in',
      user: fakePollWorkerUser(electionDefinition),
      sessionExpiresAt: fakeSessionExpiresAt(),
    })
  );
  result = await apiClient.clearScannerReportDataFromCard({ electionHash });
  expect(result).toEqual(ok());
  expect(mockAuth.clearCardData).toHaveBeenCalledTimes(1);
  expect(mockAuth.clearCardData).toHaveBeenNthCalledWith(1, {
    electionHash,
    jurisdiction,
  });
});

test('configureBallotPackageFromUsb reads to and writes from store', async () => {
  const { electionDefinition } = electionFamousNames2021Fixtures;

  // Mock election manager
  mockOf(mockAuth.getAuthStatus).mockImplementation(() =>
    Promise.resolve({
      status: 'logged_in',
      user: fakeElectionManagerUser(electionDefinition),
      sessionExpiresAt: fakeSessionExpiresAt(),
    })
  );

  const zipBuffer = createBallotPackageWithoutTemplates(electionDefinition, {
    systemSettingsString: systemSettings.asText(),
  });
  mockUsb.insertUsbDrive({
    'ballot-packages': {
      'test-ballot-package.zip': zipBuffer,
    },
  });

  const writeResult = await apiClient.configureBallotPackageFromUsb({
    electionHash: electionDefinition.electionHash,
  });
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

  // Mock election manager
  mockOf(mockAuth.getAuthStatus).mockImplementation(() =>
    Promise.resolve({
      status: 'logged_in',
      user: fakeElectionManagerUser(electionDefinition),
      sessionExpiresAt: new Date().getTime() + 60 * 1000,
    })
  );

  const zipBuffer = createBallotPackageWithoutTemplates(electionDefinition, {
    systemSettingsString: systemSettings.asText(),
  });
  mockUsb.insertUsbDrive({
    'ballot-packages': {
      'test-ballot-package.zip': zipBuffer,
    },
  });

  const writeResult = await apiClient.configureBallotPackageFromUsb({
    electionHash: electionDefinition.electionHash,
  });
  assert(writeResult.isOk());
  await apiClient.unconfigureMachine();

  const readResult = await apiClient.getSystemSettings();
  expect(readResult).toBeNull();
  const electionDefinitionResult = await apiClient.getElectionDefinition();
  expect(electionDefinitionResult).toBeNull();
});

test('configureBallotPackageFromUsb throws when no USB drive mounted', async () => {
  const { electionDefinition } = electionFamousNames2021Fixtures;

  await expect(
    apiClient.configureBallotPackageFromUsb({
      electionHash: electionDefinition.electionHash,
    })
  ).rejects.toThrow('No USB drive mounted');
});

test('configureBallotPackageFromUsb returns an error if ballot package parsing fails', async () => {
  const { electionDefinition } = electionFamousNames2021Fixtures;

  // Lack of auth will cause ballot package reading to throw
  mockOf(mockAuth.getAuthStatus).mockImplementation(() =>
    Promise.resolve({
      status: 'logged_out',
      reason: 'no_card',
    })
  );

  mockUsb.insertUsbDrive({
    'ballot-packages': {
      'test-ballot-package.zip': Buffer.from("doesnk't matter"),
    },
  });

  const result = await apiClient.configureBallotPackageFromUsb({
    electionHash: electionDefinition.electionHash,
  });
  assert(result.isErr());
  expect(result.err()).toEqual('auth_required_before_ballot_package_load');
});

test('configureSampleBallotPackage configures electionSampleDefinition and DEFAULT_SYSTEM_SETTINGS', async () => {
  const writeResult = await apiClient.configureSampleBallotPackage();
  assert(writeResult.isOk());

  const readResult = await apiClient.getSystemSettings();
  expect(readResult).toEqual(DEFAULT_SYSTEM_SETTINGS);
  const electionDefinitionResult = await apiClient.getElectionDefinition();
  expect(electionDefinitionResult).toEqual(electionSampleDefinition);
});
