import {
  getCastVoteRecordExportDirectoryPaths,
  readCastVoteRecordExport,
} from '@votingworks/backend';
import { assertDefined, err, ok } from '@votingworks/basics';
import { mockOf } from '@votingworks/test-utils';
import { CVR } from '@votingworks/types';
import {
  BooleanEnvironmentVariableName,
  convertCastVoteRecordVotesToTabulationVotes,
  getCurrentSnapshot,
  getFeatureFlagMock,
} from '@votingworks/utils';

import { scanBallot, withApp } from '../test/helpers/custom_helpers';
import { configureApp } from '../test/helpers/shared_helpers';

jest.setTimeout(30_000);

const mockFeatureFlagger = getFeatureFlagMock();

jest.mock('@votingworks/utils', (): typeof import('@votingworks/utils') => {
  return {
    ...jest.requireActual('@votingworks/utils'),
    isFeatureFlagEnabled: (flag) => mockFeatureFlagger.isEnabled(flag),
  };
});

beforeEach(() => {
  mockFeatureFlagger.resetFeatureFlags();
  mockFeatureFlagger.enableFeatureFlag(
    BooleanEnvironmentVariableName.SKIP_ELECTION_PACKAGE_AUTHENTICATION
  );
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
      expect(exportDirectoryPaths[0]).toMatch(/\/TEST__machine_000__*/);

      const { castVoteRecordExportMetadata, castVoteRecordIterator } = (
        await readCastVoteRecordExport(exportDirectoryPaths[0])
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

test('continuous CVR export with a mode switch in between', async () => {
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

      await apiClient.setTestMode({ isTestMode: false });
      await apiClient.setTestMode({ isTestMode: true });
      await apiClient.transitionPolls({ type: 'open_polls', time: Date.now() });

      await scanBallot(mockScanner, apiClient, workspace.store, 0);

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
          mode: 'recovery_export',
        })
      ).toEqual(ok());
    }
  );
});

test('CVR resync after swapping the USB drive', async () => {
  await withApp(
    {},
    async ({ apiClient, mockAuth, mockScanner, mockUsbDrive, workspace }) => {
      await configureApp(apiClient, mockAuth, mockUsbDrive, { testMode: true });

      await scanBallot(mockScanner, apiClient, workspace.store, 0);

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
    {},
    async ({ apiClient, mockAuth, mockScanner, mockUsbDrive, workspace }) => {
      await configureApp(apiClient, mockAuth, mockUsbDrive, { testMode: true });

      await scanBallot(mockScanner, apiClient, workspace.store, 0);

      await apiClient.setIsContinuousExportEnabled({
        isContinuousExportEnabled: false,
      });

      await scanBallot(mockScanner, apiClient, workspace.store, 1, {
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
    {},
    async ({ apiClient, mockAuth, mockScanner, mockUsbDrive, workspace }) => {
      await configureApp(apiClient, mockAuth, mockUsbDrive, { testMode: true });

      await scanBallot(mockScanner, apiClient, workspace.store, 0);

      mockUsbDrive.removeUsbDrive();

      expect(
        await apiClient.exportCastVoteRecordsToUsbDrive({
          mode: 'full_export',
        })
      ).toEqual(err({ type: 'missing-usb-drive' }));
    }
  );
});
