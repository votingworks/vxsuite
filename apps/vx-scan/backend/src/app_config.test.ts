import { MockScannerClient } from '@votingworks/plustek-scanner';
import {
  electionFamousNames2021Fixtures,
  electionMinimalExhaustiveSampleSinglePrecinctDefinition,
  electionSampleDefinition,
} from '@votingworks/fixtures';
import waitForExpect from 'wait-for-expect';
import { LogEventId } from '@votingworks/logging';
import * as grout from '@votingworks/grout';
import {
  ALL_PRECINCTS_SELECTION,
  ReportSourceMachineType,
  ScannerReportData,
  ScannerReportDataSchema,
  SCANNER_RESULTS_FOLDER,
  singlePrecinctSelectionFor,
} from '@votingworks/utils';
import { assert, err, ok, Result } from '@votingworks/basics';
import fs from 'fs';
import { join } from 'path';
import {
  fakeElectionManagerUser,
  fakePollWorkerUser,
  generateCvr,
  mockOf,
} from '@votingworks/test-utils';
import {
  ballotImages,
  configureApp,
  createApp,
  createBallotPackageWithoutTemplates,
  waitForStatus,
} from '../test/helpers/app_helpers';
import { Api } from './app';
import { SheetInterpretation } from './types';

jest.setTimeout(20_000);
jest.mock('@votingworks/ballot-encoder', () => {
  return {
    ...jest.requireActual('@votingworks/ballot-encoder'),
    // to allow changing election definitions without changing the image fixtures
    // TODO: generate image fixtures from election definitions more easily
    sliceElectionHash: () => 'da81438d51136692b43c',
  };
});

async function scanBallot(
  mockPlustek: MockScannerClient,
  apiClient: grout.Client<Api>,
  initialBallotsCounted: number
) {
  (
    await mockPlustek.simulateLoadSheet(ballotImages.completeBmd)
  ).unsafeUnwrap();
  await waitForStatus(apiClient, {
    state: 'ready_to_scan',
    ballotsCounted: initialBallotsCounted,
  });

  const interpretation: SheetInterpretation = {
    type: 'ValidSheet',
  };

  await apiClient.scanBallot();
  await waitForStatus(apiClient, {
    state: 'ready_to_accept',
    interpretation,
    ballotsCounted: initialBallotsCounted,
  });
  await apiClient.acceptBallot();
  await waitForStatus(apiClient, {
    ballotsCounted: initialBallotsCounted + 1,
    state: 'accepted',
    interpretation,
  });

  // Wait for transition back to no paper
  await waitForStatus(apiClient, {
    state: 'no_paper',
    ballotsCounted: initialBallotsCounted + 1,
  });
}

test('uses machine config from env', async () => {
  const originalEnv = process.env;
  process.env = {
    ...originalEnv,
    VX_MACHINE_ID: 'test-machine-id',
    VX_CODE_VERSION: 'test-code-version',
  };

  const { apiClient } = await createApp();
  expect(await apiClient.getMachineConfig()).toEqual({
    machineId: 'test-machine-id',
    codeVersion: 'test-code-version',
  });

  process.env = originalEnv;
});

test('uses default machine config if not set', async () => {
  const { apiClient } = await createApp();
  expect(await apiClient.getMachineConfig()).toEqual({
    machineId: '0000',
    codeVersion: 'dev',
  });
});

test("fails to configure if there's no ballot package on the usb drive", async () => {
  const { apiClient, mockUsb } = await createApp();
  mockUsb.insertUsbDrive({});
  expect(await apiClient.configureFromBallotPackageOnUsbDrive()).toEqual(
    err('no_ballot_package_on_usb_drive')
  );
  mockUsb.removeUsbDrive();
  mockUsb.insertUsbDrive({ 'ballot-packages': {} });
  expect(await apiClient.configureFromBallotPackageOnUsbDrive()).toEqual(
    err('no_ballot_package_on_usb_drive')
  );
});

test("if there's only one precinct in the election, it's selected automatically on configure", async () => {
  const { apiClient, mockAuth, mockUsb } = await createApp();
  mockUsb.insertUsbDrive({
    'ballot-packages': {
      'test-ballot-package.zip': createBallotPackageWithoutTemplates(
        electionMinimalExhaustiveSampleSinglePrecinctDefinition
      ),
    },
  });
  expect(await apiClient.configureFromBallotPackageOnUsbDrive()).toEqual(ok());
  const config = await apiClient.getConfig();
  expect(config.precinctSelection).toMatchObject({
    kind: 'SinglePrecinct',
    precinctId: 'precinct-1',
  });

  expect(mockAuth.setElectionDefinition).toHaveBeenCalledTimes(1);
  expect(mockAuth.setElectionDefinition).toHaveBeenNthCalledWith(
    1,
    electionMinimalExhaustiveSampleSinglePrecinctDefinition
  );
  expect(mockAuth.setPrecinctSelection).toHaveBeenCalledTimes(1);
  expect(mockAuth.setPrecinctSelection).toHaveBeenNthCalledWith(1, {
    kind: 'SinglePrecinct',
    precinctId: 'precinct-1',
  });
});

test('configures using the most recently created ballot package on the usb drive', async () => {
  const { apiClient, mockAuth, mockUsb } = await createApp();

  mockUsb.insertUsbDrive({
    'ballot-packages': {
      'older-ballot-package.zip':
        electionFamousNames2021Fixtures.ballotPackage.asBuffer(),
      'newer-ballot-package.zip': createBallotPackageWithoutTemplates(
        electionSampleDefinition
      ),
    },
  });
  // Ensure our mock actually created the files in the order we expect (the
  // order of the keys in the object above)
  const [usbDrive] = await mockUsb.mock.getUsbDrives();
  assert(usbDrive.mountPoint !== undefined);
  const dirPath = join(usbDrive.mountPoint, 'ballot-packages');
  const files = fs.readdirSync(dirPath);
  const filesWithStats = files.map((file) => ({
    file,
    ...fs.statSync(join(dirPath, file)),
  }));
  expect(filesWithStats[0].file).toContain('newer-ballot-package.zip');
  expect(filesWithStats[1].file).toContain('older-ballot-package.zip');
  expect(filesWithStats[0].ctime.getTime()).toBeGreaterThan(
    filesWithStats[1].ctime.getTime()
  );

  expect(await apiClient.configureFromBallotPackageOnUsbDrive()).toEqual(ok());
  const config = await apiClient.getConfig();
  expect(config.electionDefinition?.election.title).toEqual(
    electionSampleDefinition.election.title
  );

  expect(mockAuth.setElectionDefinition).toHaveBeenCalledTimes(1);
  expect(mockAuth.setElectionDefinition).toHaveBeenNthCalledWith(
    1,
    electionSampleDefinition
  );
  expect(mockAuth.setPrecinctSelection).not.toHaveBeenCalled();
});

test('export the CVRs to USB', async () => {
  const { apiClient, workspace, mockPlustek, mockUsb } = await createApp();
  await configureApp(apiClient, mockUsb);
  await scanBallot(mockPlustek, apiClient, 0);
  expect(await apiClient.exportCastVoteRecordsToUsbDrive()).toEqual(ok());

  const [usbDrive] = await mockUsb.mock.getUsbDrives();
  assert(usbDrive.mountPoint !== undefined);
  const resultsDirPath = join(usbDrive.mountPoint, SCANNER_RESULTS_FOLDER);
  const electionDirs = fs.readdirSync(resultsDirPath);
  expect(electionDirs).toHaveLength(1);
  const electionDirPath = join(resultsDirPath, electionDirs[0]);
  const cvrFiles = fs.readdirSync(electionDirPath);
  expect(cvrFiles).toHaveLength(1);
  expect(cvrFiles[0]).toMatch(/machine_0000__1_ballots__.*.jsonl/);
  const cvrFilePath = join(electionDirPath, cvrFiles[0]);
  const cvr = JSON.parse(fs.readFileSync(cvrFilePath).toString());
  const expectedCvr = generateCvr(
    electionFamousNames2021Fixtures.election,
    {
      attorney: ['john-snow'],
      'board-of-alderman': [
        'helen-keller',
        'steve-jobs',
        'nikola-tesla',
        'vincent-van-gogh',
      ],
      'chief-of-police': ['natalie-portman'],
      'city-council': [
        'marie-curie',
        'indiana-jones',
        'mona-lisa',
        'jackie-chan',
      ],
      controller: ['winston-churchill'],
      mayor: ['sherlock-holmes'],
      'parks-and-recreation-director': ['charles-darwin'],
      'public-works-director': ['benjamin-franklin'],
    },
    {
      scannerId: '000',
    }
  );

  expect(cvr).toEqual({
    ...expectedCvr,
    _ballotId: expect.any(String),
    _batchId: expect.any(String),
  });

  expect(workspace.store.getCvrsBackupTimestamp()).toBeDefined();
});

test('setPrecinctSelection will reset polls to closed and update auth instance', async () => {
  const { apiClient, mockAuth, mockUsb, workspace } = await createApp();
  await configureApp(apiClient, mockUsb);

  mockOf(mockAuth.setPrecinctSelection).mockClear();

  workspace.store.setPollsState('polls_open');
  await apiClient.setPrecinctSelection({
    precinctSelection: singlePrecinctSelectionFor('21'),
  });
  expect(workspace.store.getPollsState()).toEqual('polls_closed_initial');

  expect(mockAuth.setPrecinctSelection).toHaveBeenCalledTimes(1);
  expect(mockAuth.setPrecinctSelection).toHaveBeenNthCalledWith(
    1,
    singlePrecinctSelectionFor('21')
  );
});

test('ballot batching', async () => {
  const { apiClient, mockPlustek, logger, workspace, mockUsb } =
    await createApp();
  await configureApp(apiClient, mockUsb);

  // Scan two ballots, which should have the same batch
  await scanBallot(mockPlustek, apiClient, 0);
  await scanBallot(mockPlustek, apiClient, 1);
  let cvrs = await apiClient.getCastVoteRecordsForTally();
  expect(cvrs).toHaveLength(2);
  const batch1Id = cvrs[0]._batchId;
  expect(cvrs[1]._batchId).toEqual(batch1Id);

  // Pause polls, which should stop the current batch
  await apiClient.setPollsState({ pollsState: 'polls_paused' });
  await waitForExpect(() => {
    expect(logger.log).toHaveBeenCalledWith(
      LogEventId.ScannerBatchEnded,
      'system',
      expect.objectContaining({
        disposition: 'success',
        message:
          'Current scanning batch ended due to polls being closed or voting being paused.',
        batchId: batch1Id,
      })
    );
  });

  // Reopen polls, which should stop the current batch
  await apiClient.setPollsState({ pollsState: 'polls_open' });
  await waitForExpect(() => {
    expect(logger.log).toHaveBeenCalledWith(
      LogEventId.ScannerBatchStarted,
      'system',
      expect.objectContaining({
        disposition: 'success',
        message:
          'New scanning batch started due to polls being opened or voting being resumed.',
        batchId: expect.not.stringMatching(batch1Id),
      })
    );
  });

  // Confirm there is a new, second batch distinct from the first
  await scanBallot(mockPlustek, apiClient, 2);
  await scanBallot(mockPlustek, apiClient, 3);
  cvrs = await apiClient.getCastVoteRecordsForTally();
  expect(cvrs).toHaveLength(4);
  const batch2Id = cvrs[2]._batchId;
  expect(batch2Id).not.toEqual(batch1Id);
  expect(cvrs[3]._batchId).toEqual(batch2Id);

  // Replace the ballot bag, which should create a new batch
  await apiClient.recordBallotBagReplaced();
  expect(workspace.store.getBallotCountWhenBallotBagLastReplaced()).toEqual(4);
  await waitForExpect(() => {
    expect(logger.log).toHaveBeenCalledWith(
      LogEventId.ScannerBatchEnded,
      'system',
      expect.objectContaining({
        disposition: 'success',
        message: 'Current scanning batch ended due to ballot bag replacement.',
        batchId: batch2Id,
      })
    );
  });
  await waitForExpect(() => {
    expect(logger.log).toHaveBeenCalledWith(
      LogEventId.ScannerBatchStarted,
      'system',
      expect.objectContaining({
        disposition: 'success',
        message: 'New scanning batch started due to ballot bag replacement.',
        batchId: expect.not.stringMatching(batch2Id),
      })
    );
  });

  // Confirm there is a third batch, distinct from the second
  await scanBallot(mockPlustek, apiClient, 4);
  await scanBallot(mockPlustek, apiClient, 5);
  cvrs = await apiClient.getCastVoteRecordsForTally();
  expect(cvrs).toHaveLength(6);
  const batch3Id = cvrs[4]._batchId;
  expect(cvrs[3]._batchId).not.toEqual(batch3Id);
  expect(cvrs[5]._batchId).toEqual(batch3Id);
});

test('unconfiguring machine', async () => {
  const { apiClient, mockAuth, mockUsb, interpreter, workspace } =
    await createApp();
  await configureApp(apiClient, mockUsb);

  jest.spyOn(interpreter, 'unconfigure');
  jest.spyOn(workspace, 'reset');

  await apiClient.unconfigureElection({});

  expect(interpreter.unconfigure).toHaveBeenCalledTimes(1);
  expect(workspace.reset).toHaveBeenCalledTimes(1);
  expect(mockAuth.clearElectionDefinition).toHaveBeenCalledTimes(1);
  expect(mockAuth.clearPrecinctSelection).toHaveBeenCalledTimes(1);
});

test('auth', async () => {
  const { apiClient, mockAuth, mockUsb } = await createApp();
  await configureApp(apiClient, mockUsb);

  await apiClient.getAuthStatus();
  await apiClient.checkPin({ pin: '123456' });

  expect(mockAuth.getAuthStatus).toHaveBeenCalledTimes(1);
  expect(mockAuth.checkPin).toHaveBeenCalledTimes(1);
  expect(mockAuth.checkPin).toHaveBeenNthCalledWith(1, { pin: '123456' });
});

test('auth initial election definition and precinct selection configuration', async () => {
  const createAppResult = await createApp();
  await configureApp(createAppResult.apiClient, createAppResult.mockUsb);
  const preconfiguredWorkspace = createAppResult.workspace;

  const { mockAuth } = await createApp({
    preconfiguredWorkspace,
  });

  expect(mockAuth.setElectionDefinition).toHaveBeenCalledTimes(1);
  expect(mockAuth.setElectionDefinition).toHaveBeenNthCalledWith(
    1,
    electionFamousNames2021Fixtures.electionDefinition
  );
  expect(mockAuth.setPrecinctSelection).toHaveBeenCalledTimes(1);
  expect(mockAuth.setPrecinctSelection).toHaveBeenNthCalledWith(
    1,
    ALL_PRECINCTS_SELECTION
  );
});

test('write scanner report data to card', async () => {
  const { apiClient, mockAuth, mockUsb } = await createApp();
  await configureApp(apiClient, mockUsb);

  mockOf(mockAuth.writeCardData).mockImplementation(() =>
    Promise.resolve(ok())
  );

  const { electionDefinition } = electionFamousNames2021Fixtures;
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
  let result: Result<void, Error>;

  mockOf(mockAuth.getAuthStatus).mockImplementation(() => ({
    status: 'logged_out',
    reason: 'no_card',
  }));
  result = await apiClient.saveScannerReportDataToCard({ scannerReportData });
  expect(result).toEqual(err(new Error('User is not logged in')));

  mockOf(mockAuth.getAuthStatus).mockImplementation(() => ({
    status: 'logged_in',
    user: fakeElectionManagerUser(electionDefinition),
  }));
  result = await apiClient.saveScannerReportDataToCard({ scannerReportData });
  expect(result).toEqual(err(new Error('User is not a poll worker')));

  mockOf(mockAuth.getAuthStatus).mockImplementation(() => ({
    status: 'logged_in',
    user: fakePollWorkerUser(electionDefinition),
  }));
  result = await apiClient.saveScannerReportDataToCard({ scannerReportData });
  expect(result).toEqual(ok());
  expect(mockAuth.writeCardData).toHaveBeenCalledTimes(1);
  expect(mockAuth.writeCardData).toHaveBeenNthCalledWith(1, {
    data: scannerReportData,
    schema: ScannerReportDataSchema,
  });
});
