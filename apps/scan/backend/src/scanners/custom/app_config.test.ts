import {
  electionFamousNames2021Fixtures,
  electionGeneralDefinition,
  electionTwoPartyPrimaryFixtures,
} from '@votingworks/fixtures';
import waitForExpect from 'wait-for-expect';
import { LogEventId } from '@votingworks/logging';
import {
  BooleanEnvironmentVariableName,
  SCANNER_RESULTS_FOLDER,
  convertCastVoteRecordVotesToTabulationVotes,
  getFeatureFlagMock,
  singlePrecinctSelectionFor,
} from '@votingworks/utils';
import { assert, err, find, iter, ok, unique } from '@votingworks/basics';
import fs from 'fs';
import { join } from 'path';
import {
  fakeElectionManagerUser,
  fakeSessionExpiresAt,
  mockOf,
} from '@votingworks/test-utils';
import {
  createBallotPackageZipArchive,
  readCastVoteRecordExport,
} from '@votingworks/backend';
import { InsertedSmartCardAuthApi } from '@votingworks/auth';
import { CVR, ElectionDefinition, unsafeParse } from '@votingworks/types';
import { configureApp } from '../../../test/helpers/shared_helpers';
import { scanBallot, withApp } from '../../../test/helpers/custom_helpers';

jest.setTimeout(20_000);

const mockFeatureFlagger = getFeatureFlagMock();

jest.mock('@votingworks/utils', (): typeof import('@votingworks/utils') => {
  return {
    ...jest.requireActual('@votingworks/utils'),
    isFeatureFlagEnabled: (flag) => mockFeatureFlagger.isEnabled(flag),
  };
});

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

beforeEach(() => {
  mockFeatureFlagger.resetFeatureFlags();
  mockFeatureFlagger.enableFeatureFlag(
    BooleanEnvironmentVariableName.SKIP_BALLOT_PACKAGE_AUTHENTICATION
  );
});

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
  await withApp({}, async ({ apiClient, mockAuth, mockUsbDrive }) => {
    mockElectionManager(mockAuth, electionGeneralDefinition);
    mockUsbDrive.insertUsbDrive({});
    expect(await apiClient.configureFromBallotPackageOnUsbDrive()).toEqual(
      err('no_ballot_package_on_usb_drive')
    );

    mockUsbDrive.insertUsbDrive({ 'ballot-packages': {} });
    expect(await apiClient.configureFromBallotPackageOnUsbDrive()).toEqual(
      err('no_ballot_package_on_usb_drive')
    );
  });
});

test('fails to configure ballot package if logged out', async () => {
  await withApp({}, async ({ apiClient, mockUsbDrive, mockAuth }) => {
    mockLoggedOut(mockAuth);
    mockUsbDrive.insertUsbDrive({
      'ballot-packages': {
        'test-ballot-package.zip': await createBallotPackageZipArchive({
          electionDefinition: electionGeneralDefinition,
        }),
      },
    });
    expect(await apiClient.configureFromBallotPackageOnUsbDrive()).toEqual(
      err('auth_required_before_ballot_package_load')
    );
  });
});

test('fails to configure ballot package if election definition on card does not match that of the ballot package', async () => {
  await withApp({}, async ({ apiClient, mockUsbDrive, mockAuth }) => {
    mockElectionManager(
      mockAuth,
      electionFamousNames2021Fixtures.electionDefinition
    );
    mockUsbDrive.insertUsbDrive({
      'ballot-packages': {
        'test-ballot-package.zip': await createBallotPackageZipArchive({
          electionDefinition: electionGeneralDefinition,
        }),
      },
    });
    expect(await apiClient.configureFromBallotPackageOnUsbDrive()).toEqual(
      err('election_hash_mismatch')
    );
  });
});

test("if there's only one precinct in the election, it's selected automatically on configure", async () => {
  const electionDefinition =
    electionTwoPartyPrimaryFixtures.singlePrecinctElectionDefinition;
  await withApp({}, async ({ apiClient, mockUsbDrive, mockAuth }) => {
    mockElectionManager(mockAuth, electionDefinition);
    mockUsbDrive.insertUsbDrive({
      'ballot-packages': {
        'test-ballot-package.zip': await createBallotPackageZipArchive({
          electionDefinition,
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
  await withApp({}, async ({ apiClient, mockUsbDrive, mockAuth }) => {
    mockElectionManager(mockAuth, electionGeneralDefinition);

    mockUsbDrive.insertUsbDrive({
      'ballot-packages': {
        'older-ballot-package.zip': await createBallotPackageZipArchive(
          electionFamousNames2021Fixtures.electionJson.toBallotPackage()
        ),
        'newer-ballot-package.zip': await createBallotPackageZipArchive({
          electionDefinition: electionGeneralDefinition,
        }),
      },
    });
    // Ensure our mock actually created the files in the order we expect (the
    // order of the keys in the object above)
    const usbDrive = await mockUsbDrive.usbDrive.status();
    assert(usbDrive.status === 'mounted');
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
      electionGeneralDefinition.election.title
    );
  });
});

test('continuous CVR export', async () => {
  await withApp(
    {},
    async ({ apiClient, mockScanner, mockUsbDrive, mockAuth }) => {
      await configureApp(apiClient, mockAuth, mockUsbDrive, { testMode: true });
      await scanBallot(mockScanner, apiClient, 0);

      const usbDrive = await mockUsbDrive.usbDrive.status();
      assert(usbDrive.status === 'mounted');
      const resultsDirPath = join(usbDrive.mountPoint, SCANNER_RESULTS_FOLDER);
      const electionDirs = fs.readdirSync(resultsDirPath);
      expect(electionDirs).toHaveLength(1);
      const electionDirPath = join(resultsDirPath, electionDirs[0]);
      const cvrReportDirectories = fs
        .readdirSync(electionDirPath)
        // Filter out signature files
        .filter((path) => !path.endsWith('.vxsig'));
      expect(cvrReportDirectories).toHaveLength(1);
      expect(cvrReportDirectories[0]).toMatch(/TEST__machine_000__*/);
      const cvrReportDirectoryPath = join(
        electionDirPath,
        cvrReportDirectories[0]
      );

      const { castVoteRecordIterator } = (
        await readCastVoteRecordExport(cvrReportDirectoryPath)
      ).unsafeUnwrap();
      const cvrs: CVR.CVR[] = (await castVoteRecordIterator.toArray()).map(
        (castVoteRecordResult) =>
          castVoteRecordResult.unsafeUnwrap().castVoteRecord
      );
      const cvr = cvrs[0];
      expect(cvrs.length).toEqual(1);
      expect(
        convertCastVoteRecordVotesToTabulationVotes(
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
    }
  );
});

test('continuous CVR export, including polls closing, followed by a full export', async () => {
  await withApp(
    {},
    async ({ apiClient, mockAuth, mockScanner, mockUsbDrive }) => {
      await configureApp(apiClient, mockAuth, mockUsbDrive, { testMode: true });
      await scanBallot(mockScanner, apiClient, 0, {
        skipWaitForContinuousExportToUsbDrive: true,
      });
      await scanBallot(mockScanner, apiClient, 1);

      expect(
        await apiClient.exportCastVoteRecordsToUsbDrive({
          mode: 'polls_closing',
        })
      ).toEqual(ok());

      expect(
        await apiClient.exportCastVoteRecordsToUsbDrive({
          mode: 'full_export',
        })
      ).toEqual(ok());
    }
  );
});

test('setPrecinctSelection will reset polls to closed', async () => {
  await withApp(
    {},
    async ({ apiClient, mockUsbDrive, workspace, mockAuth }) => {
      await configureApp(apiClient, mockAuth, mockUsbDrive);

      workspace.store.setPollsState('polls_open');
      await apiClient.setPrecinctSelection({
        precinctSelection: singlePrecinctSelectionFor('21'),
      });
      expect(workspace.store.getPollsState()).toEqual('polls_closed_initial');
    }
  );
});

test('ballot batching', async () => {
  await withApp(
    {},
    async ({
      apiClient,
      mockScanner,
      logger,
      workspace,
      mockUsbDrive,
      mockAuth,
    }) => {
      await configureApp(apiClient, mockAuth, mockUsbDrive, { testMode: true });
      const { store } = workspace;
      function getCvrIds() {
        return iter(store.forEachResultSheet())
          .map((r) => r.id)
          .toArray();
      }
      function getBatchIds() {
        return unique(
          iter(store.forEachResultSheet())
            .map((r) => r.batchId)
            .toArray()
        );
      }

      // Scan two ballots, which should have the same batch
      await scanBallot(mockScanner, apiClient, 0, {
        skipWaitForContinuousExportToUsbDrive: true,
      });
      await scanBallot(mockScanner, apiClient, 1, {
        skipWaitForContinuousExportToUsbDrive: true,
      });
      let batchIds = getBatchIds();
      expect(getCvrIds()).toHaveLength(2);
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
      await scanBallot(mockScanner, apiClient, 2, {
        skipWaitForContinuousExportToUsbDrive: true,
      });
      await scanBallot(mockScanner, apiClient, 3, {
        skipWaitForContinuousExportToUsbDrive: true,
      });
      batchIds = getBatchIds();
      expect(getCvrIds()).toHaveLength(4);
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
      await scanBallot(mockScanner, apiClient, 4, {
        skipWaitForContinuousExportToUsbDrive: true,
      });
      await scanBallot(mockScanner, apiClient, 5);
      batchIds = getBatchIds();
      expect(getCvrIds()).toHaveLength(6);
      expect(batchIds).toHaveLength(3);
    }
  );
});

test('unconfiguring machine', async () => {
  await withApp(
    {},
    async ({ apiClient, mockUsbDrive, workspace, mockAuth }) => {
      await configureApp(apiClient, mockAuth, mockUsbDrive);

      jest.spyOn(workspace, 'reset');

      await apiClient.unconfigureElection({});

      expect(workspace.reset).toHaveBeenCalledTimes(1);
    }
  );
});
