import {
  electionFamousNames2021Fixtures,
  electionGeneralDefinition,
  electionTwoPartyPrimaryFixtures,
} from '@votingworks/fixtures';
import waitForExpect from 'wait-for-expect';
import { LogEventId } from '@votingworks/logging';
import {
  BooleanEnvironmentVariableName,
  convertCastVoteRecordVotesToTabulationVotes,
  getCurrentSnapshot,
  getFeatureFlagMock,
  singlePrecinctSelectionFor,
} from '@votingworks/utils';
import {
  assertDefined,
  err,
  find,
  iter,
  ok,
  typedAs,
  unique,
} from '@votingworks/basics';
import {
  fakeElectionManagerUser,
  fakeSessionExpiresAt,
  mockOf,
} from '@votingworks/test-utils';
import {
  getCastVoteRecordExportDirectoryPaths,
  mockElectionPackageFileTree,
  readCastVoteRecordExport,
} from '@votingworks/backend';
import { InsertedSmartCardAuthApi } from '@votingworks/auth';
import { CVR, ElectionDefinition } from '@votingworks/types';
import { configureApp } from '../test/helpers/shared_helpers';
import { scanBallot, withApp } from '../test/helpers/custom_helpers';
import { PrecinctScannerPollsInfo } from '.';

jest.setTimeout(30_000);

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
    BooleanEnvironmentVariableName.SKIP_ELECTION_PACKAGE_AUTHENTICATION
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

test("fails to configure if there's no election package on the usb drive", async () => {
  await withApp({}, async ({ apiClient, mockAuth, mockUsbDrive }) => {
    mockElectionManager(mockAuth, electionGeneralDefinition);
    mockUsbDrive.insertUsbDrive({});
    expect(await apiClient.configureFromElectionPackageOnUsbDrive()).toEqual(
      err('no_election_package_on_usb_drive')
    );

    mockUsbDrive.insertUsbDrive({});
    expect(await apiClient.configureFromElectionPackageOnUsbDrive()).toEqual(
      err('no_election_package_on_usb_drive')
    );
  });
});

test('fails to configure election package if logged out', async () => {
  await withApp({}, async ({ apiClient, mockAuth }) => {
    mockLoggedOut(mockAuth);
    expect(await apiClient.configureFromElectionPackageOnUsbDrive()).toEqual(
      err('auth_required_before_election_package_load')
    );
  });
});

test('fails to configure election package if election definition on card does not match that of the election package', async () => {
  await withApp({}, async ({ apiClient, mockUsbDrive, mockAuth }) => {
    mockElectionManager(
      mockAuth,
      electionFamousNames2021Fixtures.electionDefinition
    );
    mockUsbDrive.insertUsbDrive(
      await mockElectionPackageFileTree({
        electionDefinition: electionGeneralDefinition,
      })
    );
    expect(await apiClient.configureFromElectionPackageOnUsbDrive()).toEqual(
      err('election_hash_mismatch')
    );
  });
});

test("if there's only one precinct in the election, it's selected automatically on configure", async () => {
  const electionDefinition =
    electionTwoPartyPrimaryFixtures.singlePrecinctElectionDefinition;
  await withApp({}, async ({ apiClient, mockUsbDrive, mockAuth }) => {
    mockElectionManager(mockAuth, electionDefinition);
    mockUsbDrive.insertUsbDrive(
      await mockElectionPackageFileTree({
        electionDefinition,
      })
    );
    expect(await apiClient.configureFromElectionPackageOnUsbDrive()).toEqual(
      ok()
    );
    const config = await apiClient.getConfig();
    expect(config.precinctSelection).toMatchObject({
      kind: 'SinglePrecinct',
      precinctId: 'precinct-1',
    });
  });
});

test('continuous CVR export, including polls closing', async () => {
  await withApp(
    {},
    async ({ apiClient, mockAuth, mockScanner, mockUsbDrive, workspace }) => {
      await configureApp(apiClient, mockAuth, mockUsbDrive, { testMode: true });

      // Don't wait for continuous export to USB drive in between scans and polls closing so that
      // we can verify that the continuous export mutex prevents continuous export operations from
      // interleaving
      await scanBallot(mockScanner, apiClient, workspace.store, 0, {
        waitForContinuousExportToUsbDrive: false,
      });
      await scanBallot(mockScanner, apiClient, workspace.store, 1, {
        waitForContinuousExportToUsbDrive: false,
      });
      await scanBallot(mockScanner, apiClient, workspace.store, 2, {
        waitForContinuousExportToUsbDrive: false,
      });

      expect(
        await apiClient.exportCastVoteRecordsToUsbDrive({
          mode: 'polls_closing',
        })
      ).toEqual(ok());

      const exportDirectoryPaths = await getCastVoteRecordExportDirectoryPaths(
        mockUsbDrive.usbDrive
      );
      expect(exportDirectoryPaths).toHaveLength(1);
      const exportDirectoryPath = exportDirectoryPaths[0];
      expect(exportDirectoryPath).toMatch(/TEST__machine_000__*/);

      const { castVoteRecordExportMetadata, castVoteRecordIterator } = (
        await readCastVoteRecordExport(exportDirectoryPath)
      ).unsafeUnwrap();

      expect(castVoteRecordExportMetadata.arePollsClosed).toEqual(true);
      expect(
        castVoteRecordExportMetadata.castVoteRecordReportMetadata.vxBatch[0]
          .NumberSheets
      ).toEqual(3);

      const castVoteRecords: CVR.CVR[] = (
        await castVoteRecordIterator.toArray()
      ).map(
        (castVoteRecordResult) =>
          castVoteRecordResult.unsafeUnwrap().castVoteRecord
      );
      expect(castVoteRecords).toHaveLength(3);

      for (const castVoteRecord of castVoteRecords) {
        const tabulationVotes = convertCastVoteRecordVotesToTabulationVotes(
          assertDefined(getCurrentSnapshot(castVoteRecord))
        );
        expect(tabulationVotes).toEqual({
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
    }
  );
});

test('continuous CVR export, including polls closing, followed by a full export', async () => {
  await withApp(
    {},
    async ({ apiClient, mockAuth, mockScanner, mockUsbDrive, workspace }) => {
      await configureApp(apiClient, mockAuth, mockUsbDrive, { testMode: true });

      // Don't wait for continuous export to USB drive in between scans and polls closing so that
      // we can verify that the continuous export mutex prevents continuous export operations from
      // interleaving
      await scanBallot(mockScanner, apiClient, workspace.store, 0, {
        waitForContinuousExportToUsbDrive: false,
      });
      await scanBallot(mockScanner, apiClient, workspace.store, 1, {
        waitForContinuousExportToUsbDrive: false,
      });

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

      // Expect two export directories, one from continuous export and one from the subsequent full
      // export. Each should contain two CVRs.
      const exportDirectoryPaths = await getCastVoteRecordExportDirectoryPaths(
        mockUsbDrive.usbDrive
      );
      expect(exportDirectoryPaths).toHaveLength(2);

      for (const exportDirectoryPath of exportDirectoryPaths) {
        const { castVoteRecordIterator } = (
          await readCastVoteRecordExport(exportDirectoryPath)
        ).unsafeUnwrap();
        const castVoteRecords: CVR.CVR[] = (
          await castVoteRecordIterator.toArray()
        ).map(
          (castVoteRecordResult) =>
            castVoteRecordResult.unsafeUnwrap().castVoteRecord
        );
        expect(castVoteRecords).toHaveLength(2);
      }
    }
  );
});

test('CVR resync', async () => {
  await withApp(
    {},
    async ({ apiClient, mockAuth, mockScanner, mockUsbDrive, workspace }) => {
      await configureApp(apiClient, mockAuth, mockUsbDrive, { testMode: true });

      await scanBallot(mockScanner, apiClient, workspace.store, 0);

      // When a CVR resync is required, the CVR resync modal appears on the "insert your ballot"
      // screen, i.e. the screen displayed when no card is inserted
      mockOf(mockAuth.getAuthStatus).mockImplementation(() =>
        Promise.resolve({ status: 'logged_out', reason: 'no_card' })
      );

      expect(
        await apiClient.exportCastVoteRecordsToUsbDrive({
          mode: 'full_export',
        })
      ).toEqual(ok());
    }
  );
});

test('setPrecinctSelection will reset polls to closed', async () => {
  await withApp({}, async ({ apiClient, mockUsbDrive, mockAuth }) => {
    await configureApp(apiClient, mockAuth, mockUsbDrive);

    expect(await apiClient.getPollsInfo()).toEqual(
      typedAs<PrecinctScannerPollsInfo>({
        pollsState: 'polls_open',
        lastPollsTransition: {
          type: 'open_polls',
          time: expect.anything(),
          ballotCount: 0,
        },
      })
    );

    await apiClient.setPrecinctSelection({
      precinctSelection: singlePrecinctSelectionFor('21'),
    });
    expect(await apiClient.getPollsInfo()).toEqual(
      typedAs<PrecinctScannerPollsInfo>({
        pollsState: 'polls_closed_initial',
      })
    );
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
      mockUsbDrive,
      mockAuth,
    }) => {
      await configureApp(apiClient, mockAuth, mockUsbDrive, { testMode: true });
      const { store } = workspace;
      function getCvrIds() {
        return iter(store.forEachAcceptedSheet())
          .map((r) => r.id)
          .toArray();
      }
      function getBatchIds() {
        return unique(
          iter(store.forEachAcceptedSheet())
            .map((r) => r.batchId)
            .toArray()
        );
      }

      // Scan two ballots, which should have the same batch
      await scanBallot(mockScanner, apiClient, workspace.store, 0);
      await scanBallot(mockScanner, apiClient, workspace.store, 1);
      let batchIds = getBatchIds();
      expect(getCvrIds()).toHaveLength(2);
      expect(batchIds).toHaveLength(1);
      const batch1Id = batchIds[0];

      // Pause polls, which should stop the current batch
      await apiClient.transitionPolls({
        type: 'pause_voting',
        time: Date.now(),
      });
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
      await apiClient.transitionPolls({
        type: 'resume_voting',
        time: Date.now(),
      });
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
      await scanBallot(mockScanner, apiClient, workspace.store, 2);
      await scanBallot(mockScanner, apiClient, workspace.store, 3);
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
      await scanBallot(mockScanner, apiClient, workspace.store, 4);
      await scanBallot(mockScanner, apiClient, workspace.store, 5);
      batchIds = getBatchIds();
      expect(getCvrIds()).toHaveLength(6);
      expect(batchIds).toHaveLength(3);
    }
  );
}, 30_000);

test('unconfiguring machine', async () => {
  await withApp(
    {},
    async ({ apiClient, mockUsbDrive, workspace, mockAuth }) => {
      await configureApp(apiClient, mockAuth, mockUsbDrive);

      jest.spyOn(workspace, 'reset');

      await apiClient.unconfigureElection();

      expect(workspace.reset).toHaveBeenCalledTimes(1);
    }
  );
});
