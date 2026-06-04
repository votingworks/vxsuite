import { assertDefined, find } from '@votingworks/basics';
import { randomUUID as uuid } from 'node:crypto';
import {
  BallotStyleId,
  BaseBallotProps,
  ElectionDefinition,
} from '@votingworks/types';
import {
  generateTestDeckCastVoteRecords,
  getTallyReportResults,
  TestDeckBallot as TestDeckBallotSpec,
} from '@votingworks/utils';
import {
  renderToPdf,
  SummaryBallotLayoutRenderer,
  SummaryBallotPageLayout,
} from '@votingworks/printing';
import React from 'react';

import {
  AdminTallyReportByParty,
  BmdPaperBallot,
  filterVotesForContests,
} from '@votingworks/ui';
import {
  markBallotDocument,
  concatenatePdfs,
  renderBallotPdfWithMetadataQrCode,
  RendererPool,
} from '@votingworks/hmpb';

/**
 * Creates a test deck for a precinct that includes:
 * - Pre-voted ballots that cover all contest options
 * - 2 blank ballots
 * - 1 overvoted ballot
 *
 * The test deck is one long document (intended to be rendered as a single PDF).
 */
export async function createPrecinctTestDeck({
  rendererPool,
  electionDefinition,
  ballotSpecs,
  ballots,
  emitProgress,
}: {
  rendererPool: RendererPool;
  electionDefinition: ElectionDefinition;
  ballotSpecs: TestDeckBallotSpec[];
  ballots: Array<{ props: BaseBallotProps; contents: string }>;
  emitProgress?: (ballotsRendered: number) => void;
}): Promise<Uint8Array | undefined> {
  if (ballotSpecs.length === 0) {
    return undefined;
  }
  const markedBallots = await rendererPool.runTasks(
    ballotSpecs.map((ballotSpec) => async (renderer) => {
      const { props, contents } = find(
        ballots,
        (ballot) =>
          ballot.props.ballotStyleId === ballotSpec.ballotStyleId &&
          ballot.props.precinctId === ballotSpec.precinctId
      );
      const document = await renderer.loadDocumentFromContent(contents);
      const markedBallot = await markBallotDocument(document, ballotSpec.votes);
      const ballotPdf = await renderBallotPdfWithMetadataQrCode(
        props,
        markedBallot,
        electionDefinition
      );
      return ballotPdf;
    }),
    emitProgress
  );
  return await concatenatePdfs(markedBallots);
}

/**
 * Creates a test deck of summary BMD ballots for a precinct and the given ballot specs.
 * Uses render-based measurement to accurately compute page breaks based on actual votes.
 */
export async function createPrecinctSummaryBallotTestDeck({
  electionDefinition,
  ballotSpecs,
  isLiveMode,
  emitProgress,
}: {
  electionDefinition: ElectionDefinition;
  ballotSpecs: TestDeckBallotSpec[];
  isLiveMode: boolean;
  emitProgress?: (ballotsRendered: number) => void;
}): Promise<Uint8Array | undefined> {
  if (ballotSpecs.length === 0) {
    return undefined;
  }

  const { election } = electionDefinition;

  // Helper to get contests for a specific page
  function getContestsForPage(
    ballotStyleId: BallotStyleId,
    pageBreaks: SummaryBallotPageLayout[],
    pageNumber: number
  ) {
    const page = assertDefined(
      pageBreaks.find((p) => p.pageNumber === pageNumber)
    );
    const ballotStyle = assertDefined(
      election.ballotStyles.find((bs) => bs.id === ballotStyleId)
    );
    const allContests = ballotStyle.districts.flatMap((districtId) =>
      election.contests.filter((c) => c.districtId === districtId)
    );
    const contestIdSet = new Set(page.contestIds);
    return allContests.filter((c) => contestIdSet.has(c.id));
  }

  // Create all ballot React elements, computing page breaks per ballot based on actual votes
  const layoutRenderer = new SummaryBallotLayoutRenderer();
  const reactDocuments: Array<{ document: React.ReactElement }> = [];

  try {
    for (const ballotSpec of ballotSpecs) {
      // Compute page breaks for this specific ballot with its actual votes
      const pageBreaks = await layoutRenderer.computePageBreaks(
        electionDefinition,
        ballotSpec.ballotStyleId,
        ballotSpec.precinctId,
        ballotSpec.votes,
        'mark'
      );

      if (pageBreaks.length > 1) {
        // Multi-page ballot - create a page for each break
        const ballotAuditId = uuid();

        for (const pageBreak of pageBreaks) {
          const pageContests = getContestsForPage(
            ballotSpec.ballotStyleId,
            pageBreaks,
            pageBreak.pageNumber
          );

          reactDocuments.push({
            document: React.createElement(BmdPaperBallot, {
              electionDefinition,
              ballotStyleId: ballotSpec.ballotStyleId,
              precinctId: ballotSpec.precinctId,
              votes: filterVotesForContests(ballotSpec.votes, pageContests),
              isLiveMode,
              machineType: 'mark' as const,
              pageNumber: pageBreak.pageNumber,
              totalPages: pageBreaks.length,
              ballotAuditId,
              contestsForPage: pageContests,
              layout: pageBreak.layout,
            }),
          });
        }
      } else {
        // Single-page ballot
        reactDocuments.push({
          document: React.createElement(BmdPaperBallot, {
            electionDefinition,
            ballotStyleId: ballotSpec.ballotStyleId,
            precinctId: ballotSpec.precinctId,
            votes: ballotSpec.votes,
            isLiveMode,
            machineType: 'mark' as const,
          }),
        });
      }
    }
  } finally {
    await layoutRenderer.close();
  }

  // Render all ballots in a single batch call for better performance
  const pdfResults = await renderToPdf(reactDocuments);
  const ballotPdfs = pdfResults.unsafeUnwrap();

  // Emit progress after all ballots are rendered
  emitProgress?.(ballotSpecs.length);

  return await concatenatePdfs(ballotPdfs);
}

export const FULL_TEST_DECK_TALLY_REPORT_FILE_NAME =
  'full-test-deck-tally-report.pdf';

export function precinctTallyReportFileName(precinctName: string): string {
  return `${precinctName.replaceAll(' ', '_')}-test-deck-tally-report.pdf`;
}

/**
 * Returns a map of filename -> PDF for all test deck tally reports:
 * - One full test deck tally report
 * - One tally report per precinct
 */
export async function createTestDeckTallyReports({
  electionDefinition,
  generatedAtTime = new Date(),
  includeSummaryBallots,
}: {
  electionDefinition: ElectionDefinition;
  generatedAtTime?: Date;
  includeSummaryBallots: boolean;
}): Promise<Map<string, Uint8Array>> {
  const { election } = electionDefinition;
  const reports = new Map<string, Uint8Array>();

  const cvrs = generateTestDeckCastVoteRecords(election, {
    includeSummaryBallots,
  });

  const fullTallyReportResults = await getTallyReportResults(election, cvrs);
  const fullReport = (
    await renderToPdf({
      document: AdminTallyReportByParty({
        electionDefinition,
        electionPackageHash: undefined,
        title: undefined,
        isOfficial: false,
        isTest: true,
        isForLogicAndAccuracyTesting: true,
        testId: 'full-test-deck-tally-report',
        tallyReportResults: fullTallyReportResults,
        generatedAtTime,
      }),
    })
  ).unsafeUnwrap();
  reports.set(FULL_TEST_DECK_TALLY_REPORT_FILE_NAME, fullReport);

  // Generate per-precinct tally reports only if there are multiple precincts
  // (single-precinct elections would have identical data to the full report)
  if (election.precincts.length < 2) {
    return reports;
  }

  for (const precinct of election.precincts) {
    const precinctCvrs = cvrs.filter((cvr) => cvr.precinctId === precinct.id);
    const tallyReportResults = await getTallyReportResults(
      election,
      precinctCvrs,
      precinct.id
    );
    const precinctReport = (
      await renderToPdf({
        document: AdminTallyReportByParty({
          electionDefinition,
          electionPackageHash: undefined,
          title: `Tally Report • ${precinct.name}`,
          isOfficial: false,
          isTest: true,
          isForLogicAndAccuracyTesting: true,
          testId: `test-deck-tally-report-${precinct.id}`,
          tallyReportResults,
          generatedAtTime,
        }),
      })
    ).unsafeUnwrap();
    reports.set(precinctTallyReportFileName(precinct.name), precinctReport);
  }

  return reports;
}
