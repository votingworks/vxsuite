import {
  getCastVoteRecordExportDirectoryPaths,
  readCastVoteRecordExport,
} from '@votingworks/backend';
import { assertDefined, ok } from '@votingworks/basics';
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
      await configureApp(apiClient, mockAuth, mockUsbDrive, {
        testMode: true,
        openPolls: true,
      });

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

      await apiClient.closePolls();

      const exportDirectoryPaths = await getCastVoteRecordExportDirectoryPaths(
        mockUsbDrive.usbDrive
      );
      expect(exportDirectoryPaths).toHaveLength(1);
      expect(exportDirectoryPaths[0]).toMatch(/\/TEST__machine_000__*/);

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
  await withApp(
    {},
    async ({ apiClient, mockAuth, mockScanner, mockUsbDrive, workspace }) => {
      await configureApp(apiClient, mockAuth, mockUsbDrive, {
        testMode: true,
        openPolls: true,
      });

      // Don't wait for continuous export to USB drive in between scans and polls closing so that
      // we can verify that the continuous export mutex prevents continuous export operations from
      // interleaving
      await scanBallot(mockScanner, apiClient, workspace.store, 0, {
        waitForContinuousExportToUsbDrive: false,
      });
      await scanBallot(mockScanner, apiClient, workspace.store, 1, {
        waitForContinuousExportToUsbDrive: false,
      });

      await apiClient.closePolls();

      expect(await apiClient.exportCastVoteRecordsToUsbDrive()).toEqual(ok());

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
      (await apiClient.openPolls()).unsafeUnwrap();

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

      expect(await apiClient.exportCastVoteRecordsToUsbDrive()).toEqual(ok());
    }
  );
});
