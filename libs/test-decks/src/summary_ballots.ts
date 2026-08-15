import {
  BallotStyleId,
  BallotType,
  ElectionDefinition,
} from '@votingworks/types';
import { encodeSummaryBallotPage } from '@votingworks/ballot-encoder';
import { assertDefined } from '@votingworks/basics';
import {
  renderToPdf,
  SummaryBallotLayoutRenderer,
  SummaryBallotPageLayout,
} from '@votingworks/printing';
import React from 'react';
import { BmdPaperBallot, filterVotesForContests } from '@votingworks/ui';
import { randomUUID as uuid } from 'node:crypto';
import { concatenatePdfs } from '@votingworks/hmpb';
import { TestDeckBallot } from './test_decks.js';

/**
 * Creates a test deck of summary BMD ballots for the given ballot specs.
 * Uses render-based measurement to accurately compute page breaks based on actual votes.
 */
export async function createSummaryBallotTestDeck({
  electionDefinition,
  ballotSpecs,
  isLiveMode,
  emitProgress,
  generateBallotAuditId = uuid,
}: {
  electionDefinition: ElectionDefinition;
  ballotSpecs: TestDeckBallot[];
  isLiveMode: boolean;
  emitProgress?: (ballotsRendered: number) => void;
  generateBallotAuditId?: () => string;
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

      const ballotAuditId = generateBallotAuditId();

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
            contestsForPage: pageContests,
            encodedBallot: encodeSummaryBallotPage(election, {
              ballotHash: electionDefinition.ballotHash,
              ballotStyleId: ballotSpec.ballotStyleId,
              precinctId: ballotSpec.precinctId,
              votes: filterVotesForContests(ballotSpec.votes, pageContests),
              isTestMode: !isLiveMode,
              ballotType: BallotType.Precinct,
              pageNumber: pageBreak.pageNumber,
              totalPages: pageBreaks.length,
              ballotAuditId,
              contests: pageContests,
            }),
            layout: pageBreak.layout,
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
