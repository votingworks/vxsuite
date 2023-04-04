import {
  electionFamousNames2021Fixtures,
  electionMinimalExhaustiveSampleSinglePrecinctDefinition,
  electionSampleDefinition,
} from '@votingworks/fixtures';
import waitForExpect from 'wait-for-expect';
import { LogEventId } from '@votingworks/logging';
import * as grout from '@votingworks/grout';
import {
  SCANNER_RESULTS_FOLDER,
  singlePrecinctSelectionFor,
} from '@votingworks/utils';
import { assert, err, find, ok, unique } from '@votingworks/basics';
import fs from 'fs';
import { join } from 'path';
import {
  fakeElectionManagerUser,
  generateCvr,
  mockOf,
} from '@votingworks/test-utils';
import { InsertedSmartCardAuthApi } from '@votingworks/auth';
import { ElectionDefinition } from '@votingworks/types';
import { CustomScanner, mocks } from '@votingworks/custom-scanner';
import {
  configureApp,
  createBallotPackageWithoutTemplates,
  waitForStatus,
} from '../../../test/helpers/shared_helpers';
import { Api } from '../../app';
import { SheetInterpretation } from '../../types';
import { ballotImages, withApp } from '../../../test/helpers/custom_helpers';

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
  mockScanner: jest.Mocked<CustomScanner>,
  apiClient: grout.Client<Api>,
  initialBallotsCounted: number
) {
  mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_SCAN));
  await waitForStatus(apiClient, {
    state: 'ready_to_scan',
    ballotsCounted: initialBallotsCounted,
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
  });
  await apiClient.acceptBallot();
  mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_NO_PAPER));
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

function mockElectionManager(
  mockAuth: InsertedSmartCardAuthApi,
  electionDefinition: ElectionDefinition
) {
  mockOf(mockAuth.getAuthStatus).mockImplementation(() =>
    Promise.resolve({
      status: 'logged_in',
      user: fakeElectionManagerUser(electionDefinition),
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
        'test-ballot-package.zip': createBallotPackageWithoutTemplates(
          electionSampleDefinition
        ),
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
        'test-ballot-package.zip': createBallotPackageWithoutTemplates(
          electionSampleDefinition
        ),
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
        'test-ballot-package.zip': createBallotPackageWithoutTemplates(
          electionMinimalExhaustiveSampleSinglePrecinctDefinition
        ),
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

    expect(await apiClient.configureFromBallotPackageOnUsbDrive()).toEqual(
      ok()
    );
    const config = await apiClient.getConfig();
    expect(config.electionDefinition?.election.title).toEqual(
      electionSampleDefinition.election.title
    );
  });
});

test('export CVRs to USB in deprecated VotingWorks format', async () => {
  await withApp(
    {},
    async ({ apiClient, mockScanner, mockUsb, mockAuth, workspace }) => {
      await configureApp(apiClient, mockUsb, { mockAuth });
      await scanBallot(mockScanner, apiClient, 0);
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
    }
  );
});

test('setPrecinctSelection will reset polls to closed and update auth instance', async () => {
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
      await configureApp(apiClient, mockUsb, { mockAuth });

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

test('auth before configuration passes empty machine state', async () => {
  await withApp({}, async ({ apiClient, mockAuth }) => {
    await apiClient.getAuthStatus();
    await apiClient.checkPin({ pin: '123456' });

    expect(mockAuth.getAuthStatus).toHaveBeenCalledTimes(1);
    expect(mockAuth.getAuthStatus).toHaveBeenNthCalledWith(1, {
      electionHash: undefined,
      jurisdiction: undefined,
    });
    expect(mockAuth.checkPin).toHaveBeenCalledTimes(1);
    expect(mockAuth.checkPin).toHaveBeenNthCalledWith(
      1,
      {
        electionHash: undefined,
        jurisdiction: undefined,
      },
      { pin: '123456' }
    );
  });
});

test('auth after configuration passes populated machine state', async () => {
  const { electionHash } = electionFamousNames2021Fixtures.electionDefinition;
  await withApp({}, async ({ apiClient, mockAuth, mockUsb }) => {
    await configureApp(apiClient, mockUsb, { mockAuth });

    await apiClient.getAuthStatus();
    await apiClient.checkPin({ pin: '123456' });

    expect(mockAuth.getAuthStatus).toHaveBeenCalledTimes(2);
    // First call happens in configureApp -> configureFromBallotPackageOnUsbDrive
    expect(mockAuth.getAuthStatus).toHaveBeenNthCalledWith(1, {
      electionHash: undefined,
      jurisdiction: undefined,
    });
    // After configuration is done we expect susequent auth calls to have populated electionHash
    expect(mockAuth.getAuthStatus).toHaveBeenNthCalledWith(2, {
      electionHash,
    });

    expect(mockAuth.checkPin).toHaveBeenCalledTimes(1);
    expect(mockAuth.checkPin).toHaveBeenNthCalledWith(
      1,
      { electionHash },
      { pin: '123456' }
    );
  });
});
