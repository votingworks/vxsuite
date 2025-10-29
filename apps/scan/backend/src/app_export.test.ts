import { beforeEach, expect, test, vi } from 'vitest';
import {
  getCastVoteRecordExportDirectoryPaths,
  readCastVoteRecordExport,
} from '@votingworks/backend';
import { assert, assertDefined, err, find, ok } from '@votingworks/basics';
import {
  BaseBallotProps,
  CVR,
  DEFAULT_SYSTEM_SETTINGS,
} from '@votingworks/types';
import {
  BooleanEnvironmentVariableName,
  convertCastVoteRecordVotesToTabulationVotes,
  getCurrentSnapshot,
  getFeatureFlagMock,
} from '@votingworks/utils';
import {
  allBaseBallotProps,
  ballotTemplates,
  createPlaywrightRendererPool,
  renderAllBallotPdfsAndCreateElectionDefinition,
} from '@votingworks/hmpb';
import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import { decryptAes256 } from '@votingworks/auth';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { LogEventId } from '@votingworks/logging';
import { scanBallot, withApp } from '../test/helpers/pdi_helpers';
import { configureApp, pdfToImageSheet } from '../test/helpers/shared_helpers';
import { BALLOT_AUDIT_ID_FILE_NAME } from './app';

vi.setConfig({ testTimeout: 30_000 });

const mockFeatureFlagger = getFeatureFlagMock();

vi.mock(import('@votingworks/utils'), async (importActual) => ({
  ...(await importActual()),
  isFeatureFlagEnabled: (flag) => mockFeatureFlagger.isEnabled(flag),
}));

beforeEach(() => {
  vi.useRealTimers();
  mockFeatureFlagger.resetFeatureFlags();
  mockFeatureFlagger.enableFeatureFlag(
    BooleanEnvironmentVariableName.SKIP_ELECTION_PACKAGE_AUTHENTICATION
  );
});

test('continuous CVR export, including polls closing', async () => {
  await withApp(
    async ({
      apiClient,
      mockAuth,
      mockScanner,
      mockUsbDrive,
      workspace,
      clock,
    }) => {
      await configureApp(apiClient, mockAuth, mockUsbDrive, {
        testMode: true,
        openPolls: true,
      });

      // Don't wait for continuous export to USB drive in between scans and polls closing so that
      // we can verify that the continuous export mutex prevents continuous export operations from
      // interleaving
      await scanBallot(mockScanner, clock, apiClient, workspace.store, 0, {
        waitForContinuousExportToUsbDrive: false,
      });
      await scanBallot(mockScanner, clock, apiClient, workspace.store, 1, {
        waitForContinuousExportToUsbDrive: false,
      });
      await scanBallot(mockScanner, clock, apiClient, workspace.store, 2, {
        waitForContinuousExportToUsbDrive: false,
      });

      await apiClient.closePolls();

      const exportDirectoryPaths = await getCastVoteRecordExportDirectoryPaths(
        mockUsbDrive.usbDrive
      );
      expect(exportDirectoryPaths).toHaveLength(1);
      expect(exportDirectoryPaths[0]).toMatch(/\/TEST__machine_0000__*/);

      const { castVoteRecordExportMetadata, castVoteRecordIterator } = (
        await readCastVoteRecordExport(exportDirectoryPaths[0])
      ).unsafeUnwrap();

      expect(castVoteRecordExportMetadata.arePollsClosed).toEqual(true);
      expect(castVoteRecordExportMetadata.batchManifest[0].sheetCount).toEqual(
        3
      );

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
  vi.useFakeTimers({ shouldAdvanceTime: true });
  await withApp(
    async ({
      apiClient,
      mockAuth,
      mockScanner,
      mockUsbDrive,
      workspace,
      clock,
    }) => {
      await configureApp(apiClient, mockAuth, mockUsbDrive, {
        testMode: true,
        openPolls: true,
      });

      // Don't wait for continuous export to USB drive in between scans and polls closing so that
      // we can verify that the continuous export mutex prevents continuous export operations from
      // interleaving
      await scanBallot(mockScanner, clock, apiClient, workspace.store, 0, {
        waitForContinuousExportToUsbDrive: false,
      });
      await scanBallot(mockScanner, clock, apiClient, workspace.store, 1, {
        waitForContinuousExportToUsbDrive: false,
      });

      await apiClient.closePolls();

      // Ensure that the second export has a different timestamp than the first in its directory
      // name
      vi.advanceTimersByTime(1000);

      expect(
        await apiClient.exportCastVoteRecordsToUsbDrive({ mode: 'full_export' })
      ).toEqual(ok());

      // Expect two export directories, one from continuous export finished at polls closed
      // and one from the subsequent full export. Each should contain two CVRs.
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

test('continuous CVR export with a mode switch in between', async () => {
  await withApp(
    async ({
      apiClient,
      mockAuth,
      mockScanner,
      mockUsbDrive,
      workspace,
      clock,
    }) => {
      await configureApp(apiClient, mockAuth, mockUsbDrive, { testMode: true });

      // Don't wait for continuous export to USB drive in between scans and polls closing so that
      // we can verify that the continuous export mutex prevents continuous export operations from
      // interleaving
      await scanBallot(mockScanner, clock, apiClient, workspace.store, 0, {
        waitForContinuousExportToUsbDrive: false,
      });
      await scanBallot(mockScanner, clock, apiClient, workspace.store, 1, {
        waitForContinuousExportToUsbDrive: false,
      });

      await apiClient.setTestMode({ isTestMode: false });
      await apiClient.setTestMode({ isTestMode: true });
      (await apiClient.openPolls()).unsafeUnwrap();

      await scanBallot(mockScanner, clock, apiClient, workspace.store, 0);

      // Expect two export directories, one from before the mode switch and one from after
      const exportDirectoryPaths = await getCastVoteRecordExportDirectoryPaths(
        mockUsbDrive.usbDrive
      );
      expect(exportDirectoryPaths).toHaveLength(2);

      for (const [i, exportDirectoryPath] of exportDirectoryPaths.entries()) {
        const { castVoteRecordIterator } = (
          await readCastVoteRecordExport(exportDirectoryPath)
        ).unsafeUnwrap();
        const castVoteRecords: CVR.CVR[] = (
          await castVoteRecordIterator.toArray()
        ).map(
          (castVoteRecordResult) =>
            castVoteRecordResult.unsafeUnwrap().castVoteRecord
        );
        if (i === 0) {
          // Directory before mode switch
          expect(castVoteRecords).toHaveLength(2);
        } else {
          // Directory before mode switch
          expect(castVoteRecords).toHaveLength(1);
        }
      }
    }
  );
});

test('CVR resync', async () => {
  await withApp(
    async ({
      apiClient,
      mockAuth,
      mockScanner,
      mockUsbDrive,
      workspace,
      clock,
    }) => {
      await configureApp(apiClient, mockAuth, mockUsbDrive, { testMode: true });

      await scanBallot(mockScanner, clock, apiClient, workspace.store, 0);

      // When a CVR resync is required, the CVR resync modal appears on the "insert your ballot"
      // screen, i.e. the screen displayed when no card is inserted
      vi.mocked(mockAuth.getAuthStatus).mockImplementation(() =>
        Promise.resolve({ status: 'logged_out', reason: 'no_card' })
      );

      expect(
        await apiClient.exportCastVoteRecordsToUsbDrive({
          mode: 'recovery_export',
        })
      ).toEqual(ok());
    }
  );
});

test('CVR resync after swapping the USB drive', async () => {
  await withApp(
    async ({
      apiClient,
      clock,
      mockAuth,
      mockScanner,
      mockUsbDrive,
      workspace,
    }) => {
      await configureApp(apiClient, mockAuth, mockUsbDrive, { testMode: true });

      await scanBallot(mockScanner, clock, apiClient, workspace.store, 0);

      mockUsbDrive.removeUsbDrive();
      mockUsbDrive.insertUsbDrive({});

      expect(
        await apiClient.exportCastVoteRecordsToUsbDrive({
          mode: 'recovery_export',
        })
      ).toEqual(ok());
    }
  );
});

test('pausing and resuming continuous CVR export', async () => {
  await withApp(
    async ({
      apiClient,
      clock,
      mockAuth,
      mockScanner,
      mockUsbDrive,
      workspace,
    }) => {
      await configureApp(apiClient, mockAuth, mockUsbDrive, { testMode: true });

      await scanBallot(mockScanner, clock, apiClient, workspace.store, 0);

      await apiClient.setIsContinuousExportEnabled({
        isContinuousExportEnabled: false,
      });

      await scanBallot(mockScanner, clock, apiClient, workspace.store, 1, {
        waitForContinuousExportToUsbDrive: false,
      });

      let usbDriveStatus = await apiClient.getUsbDriveStatus();
      expect(
        usbDriveStatus.doesUsbDriveRequireCastVoteRecordSync
      ).toBeUndefined();

      await apiClient.setIsContinuousExportEnabled({
        isContinuousExportEnabled: true,
      });

      usbDriveStatus = await apiClient.getUsbDriveStatus();
      expect(usbDriveStatus.doesUsbDriveRequireCastVoteRecordSync).toEqual(
        true
      );

      expect(
        await apiClient.exportCastVoteRecordsToUsbDrive({
          mode: 'recovery_export',
        })
      ).toEqual(ok());

      usbDriveStatus = await apiClient.getUsbDriveStatus();
      expect(
        usbDriveStatus.doesUsbDriveRequireCastVoteRecordSync
      ).toBeUndefined();

      const exportDirectoryPaths = await getCastVoteRecordExportDirectoryPaths(
        mockUsbDrive.usbDrive
      );
      expect(exportDirectoryPaths).toHaveLength(1);
      const exportDirectoryPath = exportDirectoryPaths[0];

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
  );
});

test('CVR export error handling', async () => {
  await withApp(
    async ({
      apiClient,
      clock,
      mockAuth,
      mockScanner,
      mockUsbDrive,
      workspace,
    }) => {
      await configureApp(apiClient, mockAuth, mockUsbDrive, { testMode: true });

      await scanBallot(mockScanner, clock, apiClient, workspace.store, 0);

      mockUsbDrive.removeUsbDrive();

      expect(
        await apiClient.exportCastVoteRecordsToUsbDrive({
          mode: 'full_export',
        })
      ).toEqual(err({ type: 'missing-usb-drive' }));
    }
  );
});

test('audit ballot IDs', async () => {
  // Create a ballot and election definition with an audit ID
  const electionDefinition =
    electionFamousNames2021Fixtures.readElectionDefinition();
  const { election } = electionDefinition;
  const allBallotProps = allBaseBallotProps(election);
  const ballotPropsWithAuditId: BaseBallotProps = {
    ...find(allBallotProps, (p) => p.ballotMode === 'official'),
    ballotAuditId: '123',
  };
  const rendererPool = await createPlaywrightRendererPool();
  const { ballotPdfs, electionDefinition: electionDefinitionModified } =
    await renderAllBallotPdfsAndCreateElectionDefinition(
      rendererPool,
      ballotTemplates.VxDefaultBallot,
      [ballotPropsWithAuditId],
      'vxf'
    );
  const ballotPdf = ballotPdfs[0]!;
  await rendererPool.close();
  const ballotImages = await pdfToImageSheet(ballotPdf);

  await withApp(
    async ({
      apiClient,
      clock,
      mockAuth,
      mockScanner,
      mockUsbDrive,
      workspace,
      logger,
    }) => {
      await configureApp(apiClient, mockAuth, mockUsbDrive, {
        electionPackage: {
          electionDefinition: electionDefinitionModified,
          systemSettings: {
            ...DEFAULT_SYSTEM_SETTINGS,
            precinctScanEnableBallotAuditIds: true,
          },
        },
      });

      await scanBallot(mockScanner, clock, apiClient, workspace.store, 0, {
        waitForContinuousExportToUsbDrive: true,
        ballotImages,
      });

      const [exportDirectoryPath] = await getCastVoteRecordExportDirectoryPaths(
        mockUsbDrive.usbDrive
      );
      const { castVoteRecordIterator } = (
        await readCastVoteRecordExport(exportDirectoryPath)
      ).unsafeUnwrap();
      const castVoteRecords: CVR.CVR[] = (
        await castVoteRecordIterator.toArray()
      ).map(
        (castVoteRecordResult) =>
          castVoteRecordResult.unsafeUnwrap().castVoteRecord
      );
      expect(castVoteRecords).toHaveLength(1);

      (await apiClient.saveBallotAuditIdSecretKey()).unsafeUnwrap();
      const usbDriveStatus = await mockUsbDrive.usbDrive.status();
      assert(usbDriveStatus.status === 'mounted');
      const secretKeyPath = path.join(
        usbDriveStatus.mountPoint,
        BALLOT_AUDIT_ID_FILE_NAME
      );
      const secretKey = await readFile(secretKeyPath, 'utf-8');

      expect(
        await decryptAes256(
          secretKey,
          assertDefined(castVoteRecords[0].BallotAuditId)
        )
      ).toEqual(ballotPropsWithAuditId.ballotAuditId);

      expect(logger.logAsCurrentRole).toHaveBeenCalledWith(
        LogEventId.FileSaved,
        expect.objectContaining({
          disposition: 'success',
          fileType: 'ballotAuditIdSecretKey',
          fileName: BALLOT_AUDIT_ID_FILE_NAME,
        })
      );

      mockUsbDrive.removeUsbDrive();

      expect(await apiClient.saveBallotAuditIdSecretKey()).toEqual(
        err({ type: 'missing-usb-drive', message: 'No USB drive found' })
      );
      expect(logger.logAsCurrentRole).toHaveBeenCalledWith(
        LogEventId.FileSaved,
        expect.objectContaining({
          disposition: 'failure',
          fileType: 'ballotAuditIdSecretKey',
        })
      );
    }
  );
});
