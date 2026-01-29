import { beforeEach, expect, test, vi } from 'vitest';
import {
  BooleanEnvironmentVariableName,
  getFeatureFlagMock,
} from '@votingworks/utils';
import {
  electionFamousNames2021Fixtures,
  readElectionTwoPartyPrimaryDefinition,
} from '@votingworks/fixtures';
import {
  DEFAULT_FAMOUS_NAMES_BALLOT_STYLE_ID,
  DEFAULT_FAMOUS_NAMES_PRECINCT_ID,
  DEFAULT_FAMOUS_NAMES_VOTES,
  renderMultiPageBmdBallotFixture,
} from '@votingworks/bmd-ballot-fixtures';
import { suppressingConsoleOutput } from '@votingworks/test-utils';
import { configureApp, pdfToImageSheet } from '../test/helpers/shared_helpers';
import { scanBallot, withApp } from '../test/helpers/scanner_helpers';
import { getScannerResults } from './util/results';

const electionTwoPartyPrimaryDefinition =
  readElectionTwoPartyPrimaryDefinition();

vi.setConfig({ testTimeout: 60_000 });

const mockFeatureFlagger = getFeatureFlagMock();

vi.mock(import('@votingworks/types'), async (importActual) => {
  const original = await importActual();
  return {
    ...original,
    formatElectionHashes: vi.fn().mockReturnValue('1111111-0000000'),
  };
});

vi.mock(import('@votingworks/utils'), async (importActual) => ({
  ...(await importActual()),
  isFeatureFlagEnabled: (flag) => mockFeatureFlagger.isEnabled(flag),
}));

beforeEach(() => {
  mockFeatureFlagger.enableFeatureFlag(
    BooleanEnvironmentVariableName.SKIP_ELECTION_PACKAGE_AUTHENTICATION
  );
});

const reportPrintedTime = new Date('2021-01-01T00:00:00.000');
vi.mock(import('./util/get_current_time.js'), async (importActual) => ({
  ...(await importActual()),
  getCurrentTime: () => reportPrintedTime.getTime(),
}));

test('printReportSection can print each part of a primary report separately', async () => {
  await withApp(
    async ({
      apiClient,
      mockUsbDrive,
      mockFujitsuPrinterHandler,
      mockAuth,
    }) => {
      await configureApp(apiClient, mockAuth, mockUsbDrive, {
        openPolls: false,
        electionPackage: {
          electionDefinition: electionTwoPartyPrimaryDefinition,
        },
      });
      (await apiClient.openPolls()).unsafeUnwrap();

      // print first section
      (await apiClient.printReportSection({ index: 0 })).unsafeUnwrap();
      await expect(
        mockFujitsuPrinterHandler.getLastPrintPath()
      ).toMatchPdfSnapshot({
        customSnapshotIdentifier: 'polls-opened-report-section-mammal',
        failureThreshold: 0.0001,
      });

      // print second section
      (await apiClient.printReportSection({ index: 1 })).unsafeUnwrap();
      await expect(
        mockFujitsuPrinterHandler.getLastPrintPath()
      ).toMatchPdfSnapshot({
        customSnapshotIdentifier: 'polls-opened-report-section-fish',
        failureThreshold: 0.0001,
      });

      // can reprint a section
      (await apiClient.printReportSection({ index: 1 })).unsafeUnwrap();
      await expect(
        mockFujitsuPrinterHandler.getLastPrintPath()
      ).toMatchPdfSnapshot({
        customSnapshotIdentifier: 'polls-opened-report-section-fish',
        failureThreshold: 0.0001,
      });

      // print third section
      (await apiClient.printReportSection({ index: 2 })).unsafeUnwrap();
      await expect(
        mockFujitsuPrinterHandler.getLastPrintPath()
      ).toMatchPdfSnapshot({
        customSnapshotIdentifier: 'polls-opened-report-section-nonpartisan',
        failureThreshold: 0.0001,
      });

      expect(mockFujitsuPrinterHandler.getPrintPathHistory()).toHaveLength(4);

      mockFujitsuPrinterHandler.cleanup();
    }
  );
});

test('printing report before polls opened should fail', async () => {
  await withApp(async ({ apiClient, mockUsbDrive, mockAuth }) => {
    await configureApp(apiClient, mockAuth, mockUsbDrive, {
      testMode: true,
      openPolls: false,
    });

    // printing report before polls opened should fail
    await suppressingConsoleOutput(async () => {
      await expect(
        apiClient.printReportSection({ index: 0 })
      ).rejects.toThrow();
    });
  });
});

test('re-printing report after scanning a ballot should fail', async () => {
  await withApp(
    async ({
      apiClient,
      mockUsbDrive,
      mockAuth,
      mockScanner,
      clock,
      workspace,
    }) => {
      await configureApp(apiClient, mockAuth, mockUsbDrive, {
        testMode: true,
        openPolls: false,
      });
      (await apiClient.openPolls()).unsafeUnwrap();

      await scanBallot(mockScanner, clock, apiClient, workspace.store, 0);
      await suppressingConsoleOutput(async () => {
        await expect(
          apiClient.printReportSection({ index: 0 })
        ).rejects.toThrow();
      });
    }
  );
});

test('can print voting paused and voting resumed reports', async () => {
  await withApp(
    async ({
      apiClient,
      mockScanner,
      mockUsbDrive,
      mockFujitsuPrinterHandler,
      mockAuth,
      workspace,
      clock,
    }) => {
      await configureApp(apiClient, mockAuth, mockUsbDrive, {
        testMode: true,
      });

      await scanBallot(mockScanner, clock, apiClient, workspace.store, 0);

      // pause voting
      await apiClient.pauseVoting();
      (await apiClient.printReportSection({ index: 0 })).unsafeUnwrap();
      await expect(
        mockFujitsuPrinterHandler.getLastPrintPath()
      ).toMatchPdfSnapshot({
        customSnapshotIdentifier: 'voting-paused-report',
        failureThreshold: 0.0001,
      });

      // resume voting
      await apiClient.resumeVoting();
      (await apiClient.printReportSection({ index: 0 })).unsafeUnwrap();
      await expect(
        mockFujitsuPrinterHandler.getLastPrintPath()
      ).toMatchPdfSnapshot({
        customSnapshotIdentifier: 'voting-resumed-report',
        failureThreshold: 0.0001,
      });
    }
  );
});

test('can tabulate results and print polls closed report', async () => {
  await withApp(
    async ({
      apiClient,
      mockScanner,
      mockUsbDrive,
      mockFujitsuPrinterHandler,
      mockAuth,
      workspace,
      clock,
    }) => {
      await configureApp(apiClient, mockAuth, mockUsbDrive, {
        testMode: true,
      });

      await scanBallot(mockScanner, clock, apiClient, workspace.store, 0);
      await scanBallot(mockScanner, clock, apiClient, workspace.store, 1);
      await scanBallot(mockScanner, clock, apiClient, workspace.store, 2);

      // close polls
      await apiClient.closePolls();
      (await apiClient.printReportSection({ index: 0 })).unsafeUnwrap();
      await expect(
        mockFujitsuPrinterHandler.getLastPrintPath()
      ).toMatchPdfSnapshot({
        customSnapshotIdentifier: 'polls-closed-report',
        failureThreshold: 0.0001,
      });
    }
  );
});

test('polls closed report shows correct sheet counts for multi-page BMD ballots', async () => {
  await withApp(
    async ({
      apiClient,
      mockScanner,
      mockUsbDrive,
      mockFujitsuPrinterHandler,
      mockAuth,
      workspace,
      clock,
    }) => {
      await configureApp(apiClient, mockAuth, mockUsbDrive, {
        testMode: true,
      });

      const electionDefinition =
        electionFamousNames2021Fixtures.readElectionDefinition();

      // Split contests into 2 pages
      const page1ContestIds = [
        'mayor',
        'controller',
        'attorney',
        'public-works-director',
      ];
      const page2ContestIds = [
        'chief-of-police',
        'parks-and-recreation-director',
        'board-of-alderman',
        'city-council',
      ];

      const ballotAuditId = 'test-multi-page-audit-id';

      // Render and scan page 1
      const page1Images = await pdfToImageSheet(
        await renderMultiPageBmdBallotFixture({
          electionDefinition,
          ballotStyleId: DEFAULT_FAMOUS_NAMES_BALLOT_STYLE_ID,
          precinctId: DEFAULT_FAMOUS_NAMES_PRECINCT_ID,
          votes: DEFAULT_FAMOUS_NAMES_VOTES,
          pageNumber: 1,
          totalPages: 2,
          ballotAuditId,
          contestIdsForPage: page1ContestIds,
        })
      );
      await scanBallot(mockScanner, clock, apiClient, workspace.store, 0, {
        ballotImages: page1Images,
      });

      // Render and scan page 2
      const page2Images = await pdfToImageSheet(
        await renderMultiPageBmdBallotFixture({
          electionDefinition,
          ballotStyleId: DEFAULT_FAMOUS_NAMES_BALLOT_STYLE_ID,
          precinctId: DEFAULT_FAMOUS_NAMES_PRECINCT_ID,
          votes: DEFAULT_FAMOUS_NAMES_VOTES,
          pageNumber: 2,
          totalPages: 2,
          ballotAuditId,
          contestIdsForPage: page2ContestIds,
        })
      );
      await scanBallot(mockScanner, clock, apiClient, workspace.store, 1, {
        ballotImages: page2Images,
      });

      // Verify 2 sheets were scanned
      expect(workspace.store.getBallotsCounted()).toEqual(2);

      // Verify scanner results have correct card counts:
      // bmd[0] = 1 (page 1), bmd[1] = 1 (page 2)
      const results = await getScannerResults({ store: workspace.store });
      expect(results).toHaveLength(1);
      expect(results[0].cardCounts).toEqual(
        expect.objectContaining({
          bmd: [1, 1],
          hmpb: [],
        })
      );

      // Close polls and print the report
      await apiClient.closePolls();
      (await apiClient.printReportSection({ index: 0 })).unsafeUnwrap();
      await expect(
        mockFujitsuPrinterHandler.getLastPrintPath()
      ).toMatchPdfSnapshot({
        customSnapshotIdentifier: 'polls-closed-report-multi-page-bmd',
        failureThreshold: 0.0001,
      });
    }
  );
});

/**
 * TODO: Add test coverage for results in a primary election. This will require
 * more robust mocking of ballots for scanning that creates or copies marked
 * ballot images from the HMPB rendering library. Currently we are only testing
 * with ballot images that were individually created and added as fixtures.
 * */
