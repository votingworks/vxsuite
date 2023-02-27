import {
  assert,
  err,
  ok,
  Result,
  assert,
  err,
  find,
  ok,
  unique,
} from '@votingworks/basics';
import {
  electionFamousNames2021Fixtures,
  electionMinimalExhaustiveSampleSinglePrecinctDefinition,
  electionSampleDefinition,
} from '@votingworks/fixtures';
import { join, join } from 'path';
import * as fs from 'fs';
import {
  ALL_PRECINCTS_SELECTION,
  ReportSourceMachineType,
  ScannerReportData,
  ScannerReportDataSchema,
  singlePrecinctSelectionFor,
} from '@votingworks/utils';
import fs from 'fs';
import { generateCvr } from '@votingworks/test-utils';
import {
  configureApp,
  createApp,
  createBallotPackageWithoutTemplates,
} from '../test/helpers/app_helpers';

jest.setTimeout(20_000);

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
  const { apiClient, mockUsb } = await createApp();
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
});

test('configures using the most recently created ballot package on the usb drive', async () => {
  const { apiClient, mockUsb } = await createApp();

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
});

test('setPrecinctSelection will reset polls to closed and update auth instance', async () => {
  const { apiClient, mockUsb, workspace } = await createApp();
  await configureApp(apiClient, mockUsb);

  workspace.store.setPollsState('polls_open');
  await apiClient.setPrecinctSelection({
    precinctSelection: singlePrecinctSelectionFor('21'),
  });
  expect(workspace.store.getPollsState()).toEqual('polls_closed_initial');
});

test('ballot batching', async () => {
  const { apiClient, mockPlustek, logger, workspace, mockUsb } =
    await createApp();
  await configureApp(apiClient, mockUsb);

  // Scan two ballots, which should have the same batch
  await scanBallot(mockPlustek, apiClient, 0);
  await scanBallot(mockPlustek, apiClient, 1);
  let cvrs = await apiClient.getCastVoteRecordsForTally();
  let batchIds = unique(cvrs.map((cvr) => cvr._batchId));
  expect(cvrs).toHaveLength(2);
  expect(batchIds).toHaveLength(1);
  const batch1Id = batchIds[0];

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
  batchIds = unique(cvrs.map((cvr) => cvr._batchId));
  expect(cvrs).toHaveLength(4);
  expect(batchIds).toHaveLength(2);
  const batch2Id = find(batchIds, (batchId) => batchId !== batch1Id);

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
  batchIds = unique(cvrs.map((cvr) => cvr._batchId));
  expect(cvrs).toHaveLength(6);
  expect(batchIds).toHaveLength(3);
});

test('unconfiguring machine', async () => {
  const { apiClient, mockUsb, interpreter, workspace } = await createApp();
  await configureApp(apiClient, mockUsb);

  jest.spyOn(interpreter, 'unconfigure');
  jest.spyOn(workspace, 'reset');

  await apiClient.unconfigureElection({});

  expect(interpreter.unconfigure).toHaveBeenCalledTimes(1);
  expect(workspace.reset).toHaveBeenCalledTimes(1);
});

test('auth', async () => {
  const { electionHash } = electionFamousNames2021Fixtures.electionDefinition;
  const { apiClient, mockAuth, mockUsb } = await createApp();
  await configureApp(apiClient, mockUsb);

  await apiClient.getAuthStatus();
  await apiClient.checkPin({ pin: '123456' });

  expect(mockAuth.getAuthStatus).toHaveBeenCalledTimes(1);
  expect(mockAuth.getAuthStatus).toHaveBeenNthCalledWith(1, {
    electionHash,
  });
  expect(mockAuth.checkPin).toHaveBeenCalledTimes(1);
  expect(mockAuth.checkPin).toHaveBeenNthCalledWith(
    1,
    { electionHash },
    { pin: '123456' }
  );
});

test('write scanner report data to card', async () => {
  const { apiClient, mockAuth, mockUsb } = await createApp();
  await configureApp(apiClient, mockUsb);

  mockOf(mockAuth.writeCardData).mockImplementation(() =>
    Promise.resolve(ok())
  );

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
  let result: Result<void, Error>;

  mockOf(mockAuth.getAuthStatus).mockImplementation(() =>
    Promise.resolve({ status: 'logged_out', reason: 'no_card' })
  );
  result = await apiClient.saveScannerReportDataToCard({ scannerReportData });
  expect(result).toEqual(err(new Error('User is not logged in')));

  mockOf(mockAuth.getAuthStatus).mockImplementation(() =>
    Promise.resolve({
      status: 'logged_in',
      user: fakeElectionManagerUser(electionDefinition),
    })
  );
  result = await apiClient.saveScannerReportDataToCard({ scannerReportData });
  expect(result).toEqual(err(new Error('User is not a poll worker')));

  mockOf(mockAuth.getAuthStatus).mockImplementation(() =>
    Promise.resolve({
      status: 'logged_in',
      user: fakePollWorkerUser(electionDefinition),
    })
  );
  result = await apiClient.saveScannerReportDataToCard({ scannerReportData });
  expect(result).toEqual(ok());
  expect(mockAuth.writeCardData).toHaveBeenCalledTimes(1);
  expect(mockAuth.writeCardData).toHaveBeenNthCalledWith(
    1,
    { electionHash },
    { data: scannerReportData, schema: ScannerReportDataSchema }
  );
});
