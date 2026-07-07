import { beforeEach, expect, test, vi } from 'vitest';
import {
  BooleanEnvironmentVariableName,
  getFeatureFlagMock,
} from '@votingworks/utils';
import {
  electionFamousNames2021Fixtures,
  electionStraightPartyFixtures,
  readElectionCombinedBallotPrimaryDefinition,
  readElectionTwoPartyPrimaryDefinition,
} from '@votingworks/fixtures';
import { randomUUID as uuid } from 'node:crypto';
import {
  BallotMetadata,
  BallotType,
  ElectionDefinition,
  getBallotStyle,
  getContests,
  PartyId,
  VotesDict,
} from '@votingworks/types';
import {
  DEFAULT_FAMOUS_NAMES_BALLOT_STYLE_ID,
  DEFAULT_FAMOUS_NAMES_PRECINCT_ID,
  DEFAULT_FAMOUS_NAMES_VOTES,
  renderBmdBallotFixture,
} from '@votingworks/bmd-ballot-fixtures';
import { assert, assertDefined, ok } from '@votingworks/basics';
import { suppressingConsoleOutput } from '@votingworks/test-utils';
import {
  configureApp,
  makeHmpbSheet,
  pdfToImageSheet,
} from '../test/helpers/shared_helpers';
import type { Store } from './store';
import {
  POLLING_PLACE_ID_COMPETE_BMD,
  scanBallot,
  withApp,
} from '../test/helpers/scanner_helpers';
import { getScannerResults } from './util/results';

// UUIDs and timestamps are displayed on the polls reports.
// Mock them so snapshots are deterministic.
// Adding calls to getCurrentTime() in the code may result in snapshot changes.
let uuidCounter = 0;
let timeCounter = 0;
vi.mock('node:crypto', async (importActual) => ({
  ...(await importActual<typeof import('node:crypto')>()),
  // eslint-disable-next-line vx/gts-identifiers
  randomUUID: vi.fn(() => {
    uuidCounter += 1;
    return `00000000-0000-0000-0000-${String(uuidCounter).padStart(12, '0')}`;
  }),
}));

const reportPrintedTime = new Date('2021-01-01T00:00:00.000');
vi.mock(import('./util/get_current_time.js'), async (importActual) => ({
  ...(await importActual()),
  getCurrentTime: () => {
    timeCounter += 1;
    return reportPrintedTime.getTime() + timeCounter * 60_000;
  },
}));

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
  uuidCounter = 0;
  timeCounter = 0;
  mockFeatureFlagger.enableFeatureFlag(
    BooleanEnvironmentVariableName.SKIP_ELECTION_PACKAGE_AUTHENTICATION
  );
});

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
      expect(await apiClient.printReportSection({ index: 0 })).toEqual({
        printResult: ok(),
        numberOfSections: 3,
      });
      await expect(
        mockFujitsuPrinterHandler.getLastPrintPath()
      ).toMatchPdfSnapshot({
        customSnapshotIdentifier: 'polls-opened-report-section-mammal',
        failureThreshold: 0.0001,
      });

      // print second section
      expect(await apiClient.printReportSection({ index: 1 })).toEqual({
        printResult: ok(),
        numberOfSections: 3,
      });
      await expect(
        mockFujitsuPrinterHandler.getLastPrintPath()
      ).toMatchPdfSnapshot({
        customSnapshotIdentifier: 'polls-opened-report-section-fish',
        failureThreshold: 0.0001,
      });

      // can reprint a section
      expect(await apiClient.printReportSection({ index: 1 })).toEqual({
        printResult: ok(),
        numberOfSections: 3,
      });
      await expect(
        mockFujitsuPrinterHandler.getLastPrintPath()
      ).toMatchPdfSnapshot({
        customSnapshotIdentifier: 'polls-opened-report-section-fish',
        failureThreshold: 0.0001,
      });

      // print third section
      expect(await apiClient.printReportSection({ index: 2 })).toEqual({
        printResult: ok(),
        numberOfSections: 3,
      });
      await expect(
        mockFujitsuPrinterHandler.getLastPrintPath()
      ).toMatchPdfSnapshot({
        customSnapshotIdentifier: 'polls-opened-report-section-nonpartisan',
        failureThreshold: 0.0001,
      });

      expect(mockFujitsuPrinterHandler.getPrintPathHistory()).toHaveLength(4);

      // Polls paused/resumed reports are a single ballot count report, not
      // split by party even in a primary
      await apiClient.pauseVoting();
      expect(await apiClient.printReportSection({ index: 0 })).toEqual({
        printResult: ok(),
        numberOfSections: 1,
      });
      await apiClient.resumeVoting();
      expect(await apiClient.printReportSection({ index: 0 })).toEqual({
        printResult: ok(),
        numberOfSections: 1,
      });

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
      expect(await apiClient.printReportSection({ index: 0 })).toEqual({
        printResult: ok(),
        numberOfSections: 1,
      });
      await expect(
        mockFujitsuPrinterHandler.getLastPrintPath()
      ).toMatchPdfSnapshot({
        customSnapshotIdentifier: 'voting-paused-report',
        failureThreshold: 0.0001,
      });

      // resume voting
      await apiClient.resumeVoting();
      expect(await apiClient.printReportSection({ index: 0 })).toEqual({
        printResult: ok(),
        numberOfSections: 1,
      });
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
        // `scanBallot` defaults to the precinct for this location.
        pollingPlaceId: POLLING_PLACE_ID_COMPETE_BMD,
        testMode: true,
      });

      await scanBallot(mockScanner, clock, apiClient, workspace.store, 0);
      await scanBallot(mockScanner, clock, apiClient, workspace.store, 1);
      await scanBallot(mockScanner, clock, apiClient, workspace.store, 2);

      // close polls
      await apiClient.closePolls();
      expect(await apiClient.printReportSection({ index: 0 })).toEqual({
        printResult: ok(),
        numberOfSections: 1,
      });
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
        await renderBmdBallotFixture({
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
        await renderBmdBallotFixture({
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
      expect(await apiClient.printReportSection({ index: 0 })).toEqual({
        printResult: ok(),
        numberOfSections: 1,
      });
      await expect(
        mockFujitsuPrinterHandler.getLastPrintPath()
      ).toMatchPdfSnapshot({
        customSnapshotIdentifier: 'polls-closed-report-multi-page-bmd',
        failureThreshold: 0.0001,
      });
    }
  );
});

test('can print write-in image report after polls closed', async () => {
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

      await apiClient.closePolls();

      (await apiClient.printWriteInImageReport()).unsafeUnwrap();
      await expect(
        mockFujitsuPrinterHandler.getLastPrintPath()
      ).toMatchPdfSnapshot({
        customSnapshotIdentifier: 'write-in-image-report-integration',
      });

      mockFujitsuPrinterHandler.cleanup();
    }
  );
});

function recordHmpbBallotInStore({
  store,
  electionDefinition,
  ballotStyleId,
  precinctId,
  votes,
}: {
  store: Store;
  electionDefinition: ElectionDefinition;
  ballotStyleId: string;
  precinctId: string;
  votes: VotesDict;
}): void {
  const metadata: BallotMetadata = {
    ballotStyleId,
    ballotType: BallotType.Precinct,
    ballotHash: electionDefinition.ballotHash,
    isTestMode: true,
    precinctId,
  };
  const batchId = store.addBatch();
  store.recordSheet({
    sheetId: uuid(),
    batchId,
    pages: makeHmpbSheet({ metadata, frontVotes: votes }),
    isAccepted: true,
  });
  store.finishBatch({ batchId });
}

test('can tabulate results and print polls closed report for closed primary', async () => {
  await withApp(
    async ({
      apiClient,
      mockUsbDrive,
      mockFujitsuPrinterHandler,
      mockAuth,
      workspace,
    }) => {
      await configureApp(apiClient, mockAuth, mockUsbDrive, {
        testMode: true,
        electionPackage: {
          electionDefinition: electionTwoPartyPrimaryDefinition,
        },
      });

      // Two mammal ballots and one fish ballot, each with a nonpartisan vote.
      recordHmpbBallotInStore({
        store: workspace.store,
        electionDefinition: electionTwoPartyPrimaryDefinition,
        ballotStyleId: '1M',
        precinctId: 'precinct-1',
        votes: {
          'best-animal-mammal': ['horse'],
          'new-zoo-either': ['new-zoo-either-approved'],
        },
      });
      recordHmpbBallotInStore({
        store: workspace.store,
        electionDefinition: electionTwoPartyPrimaryDefinition,
        ballotStyleId: '1M',
        precinctId: 'precinct-1',
        votes: {
          'best-animal-mammal': ['otter'],
          'new-zoo-either': ['new-zoo-either-approved'],
        },
      });
      recordHmpbBallotInStore({
        store: workspace.store,
        electionDefinition: electionTwoPartyPrimaryDefinition,
        ballotStyleId: '2F',
        precinctId: 'precinct-1',
        votes: {
          'best-animal-fish': ['seahorse'],
          fishing: ['ban-fishing'],
        },
      });

      await apiClient.closePolls();

      // Mammal section
      expect(await apiClient.printReportSection({ index: 0 })).toEqual({
        printResult: ok(),
        numberOfSections: 3,
      });
      await expect(
        mockFujitsuPrinterHandler.getLastPrintPath()
      ).toMatchPdfSnapshot({
        customSnapshotIdentifier: 'polls-closed-twoparty-section-mammal',
        failureThreshold: 0.0001,
      });

      // Fish section
      expect(await apiClient.printReportSection({ index: 1 })).toEqual({
        printResult: ok(),
        numberOfSections: 3,
      });
      await expect(
        mockFujitsuPrinterHandler.getLastPrintPath()
      ).toMatchPdfSnapshot({
        customSnapshotIdentifier: 'polls-closed-twoparty-section-fish',
        failureThreshold: 0.0001,
      });

      // Nonpartisan section
      expect(await apiClient.printReportSection({ index: 2 })).toEqual({
        printResult: ok(),
        numberOfSections: 3,
      });
      await expect(
        mockFujitsuPrinterHandler.getLastPrintPath()
      ).toMatchPdfSnapshot({
        customSnapshotIdentifier: 'polls-closed-twoparty-section-nonpartisan',
        failureThreshold: 0.0001,
      });

      mockFujitsuPrinterHandler.cleanup();
    }
  );
});

test('can tabulate results and print polls closed report for open primary', async () => {
  const electionOpenPrimaryDefinition =
    readElectionCombinedBallotPrimaryDefinition();
  await withApp(
    async ({
      apiClient,
      mockUsbDrive,
      mockFujitsuPrinterHandler,
      mockAuth,
      workspace,
    }) => {
      await configureApp(apiClient, mockAuth, mockUsbDrive, {
        testMode: true,
        electionPackage: {
          electionDefinition: electionOpenPrimaryDefinition,
        },
      });

      function record(votes: VotesDict): void {
        recordHmpbBallotInStore({
          store: workspace.store,
          electionDefinition: electionOpenPrimaryDefinition,
          ballotStyleId: 'ballot-style-1',
          precinctId: 'precinct-1',
          votes,
        });
      }

      // Two democratic-only ballots
      record({
        'governor-democratic': ['alice-jones'],
        'ballot-measure-1': ['ballot-measure-1-yes'],
      });
      record({
        'governor-democratic': ['alice-jones'],
        'ballot-measure-1': ['ballot-measure-1-yes'],
      });
      // One republican-only ballot
      record({
        'governor-republican': ['dave-wilson'],
        'ballot-measure-1': ['ballot-measure-1-no'],
      });
      // One libertarian-only ballot
      record({
        'governor-libertarian': ['grace-kim'],
      });
      // One crossover ballot — partisan votes voided, nonpartisan counts
      record({
        'governor-democratic': ['alice-jones'],
        'governor-republican': ['dave-wilson'],
        'ballot-measure-1': ['ballot-measure-1-yes'],
      });
      // One nonpartisan-only ballot
      record({
        'ballot-measure-1': ['ballot-measure-1-no'],
      });

      await apiClient.closePolls();

      // Democratic section
      expect(await apiClient.printReportSection({ index: 0 })).toEqual({
        printResult: ok(),
        numberOfSections: 4,
      });
      await expect(
        mockFujitsuPrinterHandler.getLastPrintPath()
      ).toMatchPdfSnapshot({
        customSnapshotIdentifier:
          'polls-closed-open-primary-section-democratic',
        failureThreshold: 0.0001,
      });

      // Republican section
      expect(await apiClient.printReportSection({ index: 1 })).toEqual({
        printResult: ok(),
        numberOfSections: 4,
      });
      await expect(
        mockFujitsuPrinterHandler.getLastPrintPath()
      ).toMatchPdfSnapshot({
        customSnapshotIdentifier:
          'polls-closed-open-primary-section-republican',
        failureThreshold: 0.0001,
      });

      // Libertarian section
      expect(await apiClient.printReportSection({ index: 2 })).toEqual({
        printResult: ok(),
        numberOfSections: 4,
      });
      await expect(
        mockFujitsuPrinterHandler.getLastPrintPath()
      ).toMatchPdfSnapshot({
        customSnapshotIdentifier:
          'polls-closed-open-primary-section-libertarian',
        failureThreshold: 0.0001,
      });

      // Nonpartisan section
      expect(await apiClient.printReportSection({ index: 3 })).toEqual({
        printResult: ok(),
        numberOfSections: 4,
      });
      await expect(
        mockFujitsuPrinterHandler.getLastPrintPath()
      ).toMatchPdfSnapshot({
        customSnapshotIdentifier:
          'polls-closed-open-primary-section-nonpartisan',
        failureThreshold: 0.0001,
      });

      mockFujitsuPrinterHandler.cleanup();
    }
  );
});

test('can tabulate results and print polls closed report for straight party', async () => {
  const electionDefinition =
    electionStraightPartyFixtures.readElectionDefinition();
  await withApp(
    async ({
      apiClient,
      mockUsbDrive,
      mockFujitsuPrinterHandler,
      mockAuth,
      workspace,
    }) => {
      await configureApp(apiClient, mockAuth, mockUsbDrive, {
        testMode: true,
        electionPackage: { electionDefinition },
      });

      const { election } = electionDefinition;
      const ballotStyle = assertDefined(
        getBallotStyle({ election, ballotStyleId: '12' })
      );
      const contests = getContests({ election, ballotStyle });

      // Records a ballot that selects a straight-party ticket and leaves every
      // other contest blank. Tabulation should derive votes for the blank
      // candidate contests.
      function recordStraightPartyBallot(partyId: PartyId): void {
        const votes: VotesDict = Object.fromEntries(
          contests.map((contest) => [
            contest.id,
            contest.type === 'straight-party' ? [partyId] : [],
          ])
        );
        recordHmpbBallotInStore({
          store: workspace.store,
          electionDefinition,
          ballotStyleId: ballotStyle.id,
          precinctId: '23',
          votes,
        });
      }

      const [partyId1, partyId2] = election.parties.map((party) => party.id);
      recordStraightPartyBallot(partyId1);
      recordStraightPartyBallot(partyId1);
      recordStraightPartyBallot(partyId2);

      const results = await getScannerResults({ store: workspace.store });
      expect(results).toHaveLength(1);
      const { contestResults } = results[0];

      const straightPartyResults = contestResults['straight-party-ticket'];
      assert(straightPartyResults.contestType === 'straight-party');
      expect(straightPartyResults.tallies[partyId1]).toEqual(2);
      expect(straightPartyResults.tallies[partyId2]).toEqual(1);

      const [candidateContest] = contests.filter(
        (contest) => contest.type === 'candidate'
      );
      const candidateContestResults = contestResults[candidateContest.id];
      assert(candidateContestResults.contestType === 'candidate');
      const party1Candidates = candidateContest.candidates.filter(
        (candidate) => candidate.partyIds?.includes(partyId1)
      );
      assert(party1Candidates.length > 0);
      for (const candidate of party1Candidates) {
        expect(candidateContestResults.tallies[candidate.id].tally).toEqual(2);
      }
      const party2Candidates = candidateContest.candidates.filter(
        (candidate) => candidate.partyIds?.includes(partyId2)
      );
      assert(party2Candidates.length > 0);
      for (const candidate of party2Candidates) {
        expect(candidateContestResults.tallies[candidate.id].tally).toEqual(1);
      }

      await apiClient.closePolls();
      expect(await apiClient.printReportSection({ index: 0 })).toEqual({
        printResult: ok(),
        numberOfSections: 1,
      });
      await expect(
        mockFujitsuPrinterHandler.getLastPrintPath()
      ).toMatchPdfSnapshot({
        customSnapshotIdentifier: 'polls-closed-straight-party',
        failureThreshold: 0.0001,
      });

      mockFujitsuPrinterHandler.cleanup();
    }
  );
});
