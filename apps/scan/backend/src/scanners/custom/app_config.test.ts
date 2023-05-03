import {
  electionFamousNames2021Fixtures,
  electionMinimalExhaustiveSampleSinglePrecinctDefinition,
  electionSampleDefinition,
} from '@votingworks/fixtures';
import waitForExpect from 'wait-for-expect';
import { LogEventId } from '@votingworks/logging';
import * as grout from '@votingworks/grout';
import {
  CAST_VOTE_RECORD_REPORT_FILENAME,
  SCANNER_RESULTS_FOLDER,
  singlePrecinctSelectionFor,
} from '@votingworks/utils';
import { assert, err, find, ok, unique } from '@votingworks/basics';
import fs from 'fs';
import { join } from 'path';
import {
  fakeElectionManagerUser,
  fakeSessionExpiresAt,
  mockOf,
} from '@votingworks/test-utils';
import {
  convertCastVoteRecordVotesToLegacyVotes,
  createBallotPackageZipArchive,
  getCastVoteRecordReportImport,
  validateCastVoteRecordReportDirectoryStructure,
} from '@votingworks/backend';
import { InsertedSmartCardAuthApi } from '@votingworks/auth';
import { CVR, ElectionDefinition, unsafeParse } from '@votingworks/types';
import { CustomScanner, mocks } from '@votingworks/custom-scanner';
import {
  configureApp,
  waitForStatus,
} from '../../../test/helpers/shared_helpers';
import { Api } from '../../app';
import { SheetInterpretation } from '../../types';
import { ballotImages, withApp } from '../../../test/helpers/custom_helpers';

jest.setTimeout(20_000);

async function scanBallot(
  mockScanner: jest.Mocked<CustomScanner>,
  apiClient: grout.Client<Api>,
  initialBallotsCounted: number
) {
  mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_SCAN));
  await waitForStatus(apiClient, {
    state: 'ready_to_scan',
    ballotsCounted: initialBallotsCounted,
    canUnconfigure:
      initialBallotsCounted === 0 || (await apiClient.getConfig()).isTestMode,
  });

  const interpretation: SheetInterpretation = {
    type: 'ValidSheet',
  };

  mockScanner.scan.mockResolvedValueOnce(ok(await ballotImages.completeBmd()));
  await apiClient.scanBallot();
  mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_EJECT));
  await waitForStatus(apiClient, {
    state: 'ready_to_accept',
    interpretation,
    ballotsCounted: initialBallotsCounted,
    canUnconfigure: true,
  });
  await apiClient.acceptBallot();
  mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_NO_PAPER));
  await waitForStatus(apiClient, {
    ballotsCounted: initialBallotsCounted + 1,
    state: 'accepted',
    interpretation,
    canUnconfigure: true,
  });

  // Wait for transition back to no paper
  await waitForStatus(apiClient, {
    state: 'no_paper',
    ballotsCounted: initialBallotsCounted + 1,
    canUnconfigure: true,
  });
}

function mockElectionManager(
  mockAuth: InsertedSmartCardAuthApi,
  electionDefinition: ElectionDefinition
) {
  mockOf(mockAuth.getAuthStatus).mockImplementation(() =>
    Promise.resolve({
      status: 'logged_in',
      user: fakeElectionManagerUser(electionDefinition),
      sessionExpiresAt: fakeSessionExpiresAt(),
    })
  );
}

function mockLoggedOut(mockAuth: InsertedSmartCardAuthApi) {
  mockOf(mockAuth.getAuthStatus).mockImplementation(() =>
    Promise.resolve({ status: 'logged_out', reason: 'no_card' })
  );
}

test('uses machine config from env', async () => {
  const originalEnv = process.env;
  process.env = {
    ...originalEnv,
    VX_MACHINE_ID: 'test-machine-id',
    VX_CODE_VERSION: 'test-code-version',
  };

  await withApp({}, async ({ apiClient }) => {
    expect(await apiClient.getMachineConfig()).toEqual({
      machineId: 'test-machine-id',
      codeVersion: 'test-code-version',
    });
  });

  process.env = originalEnv;
});

test('uses default machine config if not set', async () => {
  await withApp({}, async ({ apiClient }) => {
    expect(await apiClient.getMachineConfig()).toEqual({
      machineId: '0000',
      codeVersion: 'dev',
    });
  });
});

test("fails to configure if there's no ballot package on the usb drive", async () => {
  await withApp({}, async ({ apiClient, mockAuth, mockUsb }) => {
    mockElectionManager(mockAuth, electionSampleDefinition);
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
});

test('fails to configure ballot package if logged out', async () => {
  await withApp({}, async ({ apiClient, mockUsb, mockAuth }) => {
    mockLoggedOut(mockAuth);
    mockUsb.insertUsbDrive({
      'ballot-packages': {
        'test-ballot-package.zip': await createBallotPackageZipArchive({
          electionDefinition: electionSampleDefinition,
        }),
      },
    });
    expect(await apiClient.configureFromBallotPackageOnUsbDrive()).toEqual(
      err('auth_required_before_ballot_package_load')
    );
  });
});

test('fails to configure ballot package if election definition on card does not match that of the ballot package', async () => {
  await withApp({}, async ({ apiClient, mockUsb, mockAuth }) => {
    mockElectionManager(
      mockAuth,
      electionFamousNames2021Fixtures.electionDefinition
    );
    mockUsb.insertUsbDrive({
      'ballot-packages': {
        'test-ballot-package.zip': await createBallotPackageZipArchive({
          electionDefinition: electionSampleDefinition,
        }),
      },
    });
    expect(await apiClient.configureFromBallotPackageOnUsbDrive()).toEqual(
      err('election_hash_mismatch')
    );
  });
});

test("if there's only one precinct in the election, it's selected automatically on configure", async () => {
  await withApp({}, async ({ apiClient, mockUsb, mockAuth }) => {
    mockElectionManager(
      mockAuth,
      electionMinimalExhaustiveSampleSinglePrecinctDefinition
    );
    mockUsb.insertUsbDrive({
      'ballot-packages': {
        'test-ballot-package.zip': await createBallotPackageZipArchive({
          electionDefinition:
            electionMinimalExhaustiveSampleSinglePrecinctDefinition,
        }),
      },
    });
    expect(await apiClient.configureFromBallotPackageOnUsbDrive()).toEqual(
      ok()
    );
    const config = await apiClient.getConfig();
    expect(config.precinctSelection).toMatchObject({
      kind: 'SinglePrecinct',
      precinctId: 'precinct-1',
    });
  });
});

test('configures using the most recently created ballot package on the usb drive', async () => {
  await withApp({}, async ({ apiClient, mockUsb, mockAuth }) => {
    mockElectionManager(mockAuth, electionSampleDefinition);

    mockUsb.insertUsbDrive({
      'ballot-packages': {
        'older-ballot-package.zip': await createBallotPackageZipArchive(
          electionFamousNames2021Fixtures.electionJson.toBallotPackage()
        ),
        'newer-ballot-package.zip': await createBallotPackageZipArchive({
          electionDefinition: electionSampleDefinition,
        }),
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

    expect(await apiClient.configureFromBallotPackageOnUsbDrive()).toEqual(
      ok()
    );
    const config = await apiClient.getConfig();
    expect(config.electionDefinition?.election.title).toEqual(
      electionSampleDefinition.election.title
    );
  });
});

test('export CVRs to USB', async () => {
  await withApp(
    {},
    async ({ apiClient, mockScanner, mockUsb, mockAuth, workspace }) => {
      await configureApp(apiClient, mockUsb, { mockAuth, testMode: true });
      await scanBallot(mockScanner, apiClient, 0);
      expect(await apiClient.exportCastVoteRecordsToUsbDrive()).toEqual(ok());

      const [usbDrive] = await mockUsb.mock.getUsbDrives();
      assert(usbDrive.mountPoint !== undefined);
      const resultsDirPath = join(usbDrive.mountPoint, SCANNER_RESULTS_FOLDER);
      const electionDirs = fs.readdirSync(resultsDirPath);
      expect(electionDirs).toHaveLength(1);
      const electionDirPath = join(resultsDirPath, electionDirs[0]);
      const cvrReportDirectories = fs.readdirSync(electionDirPath);
      expect(cvrReportDirectories).toHaveLength(1);
      expect(cvrReportDirectories[0]).toMatch(/machine_000__1_ballot__*/);
      const cvrReportDirectoryPath = join(
        electionDirPath,
        cvrReportDirectories[0]
      );

      // Confirm we've exported a valid CVR report in the form of a directory
      const directoryValidationResult =
        await validateCastVoteRecordReportDirectoryStructure(
          cvrReportDirectoryPath
        );
      expect(directoryValidationResult.isOk()).toBeTruthy();
      const castVoteRecordReportImportResult =
        await getCastVoteRecordReportImport(
          join(cvrReportDirectoryPath, CAST_VOTE_RECORD_REPORT_FILENAME)
        );
      const cvrs = await castVoteRecordReportImportResult
        .assertOk('test')
        .CVR.toArray();

      const cvr = cvrs[0];
      expect(cvrs.length).toEqual(1);
      expect(
        convertCastVoteRecordVotesToLegacyVotes(
          unsafeParse(CVR.CVRSchema, cvr).CVRSnapshot[0]
        )
      ).toMatchObject({
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
      });
      expect(workspace.store.getCvrsBackupTimestamp()).toBeDefined();
    }
  );
});

test('setPrecinctSelection will reset polls to closed', async () => {
  await withApp({}, async ({ apiClient, mockUsb, workspace, mockAuth }) => {
    await configureApp(apiClient, mockUsb, { mockAuth });

    workspace.store.setPollsState('polls_open');
    await apiClient.setPrecinctSelection({
      precinctSelection: singlePrecinctSelectionFor('21'),
    });
    expect(workspace.store.getPollsState()).toEqual('polls_closed_initial');
  });
});

test('ballot batching', async () => {
  await withApp(
    {},
    async ({
      apiClient,
      mockScanner,
      logger,
      workspace,
      mockUsb,
      mockAuth,
    }) => {
      await configureApp(apiClient, mockUsb, { mockAuth, testMode: true });

      // Scan two ballots, which should have the same batch
      await scanBallot(mockScanner, apiClient, 0);
      await scanBallot(mockScanner, apiClient, 1);
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

      // Reopen polls, which should start a new batch
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
      await scanBallot(mockScanner, apiClient, 2);
      await scanBallot(mockScanner, apiClient, 3);
      cvrs = await apiClient.getCastVoteRecordsForTally();
      batchIds = unique(cvrs.map((cvr) => cvr._batchId));
      expect(cvrs).toHaveLength(4);
      expect(batchIds).toHaveLength(2);
      const batch2Id = find(batchIds, (batchId) => batchId !== batch1Id);

      // Replace the ballot bag, which should create a new batch
      await apiClient.recordBallotBagReplaced();
      expect(workspace.store.getBallotCountWhenBallotBagLastReplaced()).toEqual(
        4
      );
      await waitForExpect(() => {
        expect(logger.log).toHaveBeenCalledWith(
          LogEventId.ScannerBatchEnded,
          'system',
          expect.objectContaining({
            disposition: 'success',
            message:
              'Current scanning batch ended due to ballot bag replacement.',
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
            message:
              'New scanning batch started due to ballot bag replacement.',
            batchId: expect.not.stringMatching(batch2Id),
          })
        );
      });

      // Confirm there is a third batch, distinct from the second
      await scanBallot(mockScanner, apiClient, 4);
      await scanBallot(mockScanner, apiClient, 5);
      cvrs = await apiClient.getCastVoteRecordsForTally();
      batchIds = unique(cvrs.map((cvr) => cvr._batchId));
      expect(cvrs).toHaveLength(6);
      expect(batchIds).toHaveLength(3);
    }
  );
});

test('unconfiguring machine', async () => {
  await withApp(
    {},
    async ({ apiClient, mockUsb, interpreter, workspace, mockAuth }) => {
      await configureApp(apiClient, mockUsb, { mockAuth });

      jest.spyOn(interpreter, 'unconfigure');
      jest.spyOn(workspace, 'reset');

      await apiClient.unconfigureElection({});

      expect(interpreter.unconfigure).toHaveBeenCalledTimes(1);
      expect(workspace.reset).toHaveBeenCalledTimes(1);
    }
  );
});
