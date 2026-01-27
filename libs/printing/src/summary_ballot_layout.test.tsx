import { describe, expect, test } from 'vitest';
import { iter } from '@votingworks/basics';
import {
  BallotStyleId,
  ElectionDefinition,
  VotesDict,
} from '@votingworks/types';
import { pdfToImages, toImageBuffer } from '@votingworks/image-utils';
import {
  BmdPaperBallot,
  filterVotesForContests,
  VxThemeProvider,
  GlobalStyles,
} from '@votingworks/ui';
import {
  createTestElection,
  createElectionDefinition,
  createMockVotes,
} from '@votingworks/test-utils';
import {
  SummaryBallotLayoutRenderer,
  SummaryBallotLayoutResult,
  computeSummaryBallotLayoutWithRendering,
} from './summary_ballot_layout';
import { renderToPdf } from './render';

describe('SummaryBallotLayoutRenderer', () => {
  test('computes single page for small election', async () => {
    const election = createTestElection({
      numCandidateContests: 3,
      numYesNoContests: 2,
      candidatesPerContest: 4,
    });
    const electionDefinition = createElectionDefinition(election);
    const votes = createMockVotes([...election.contests]);

    const renderer = new SummaryBallotLayoutRenderer();
    try {
      const result = await renderer.computePageBreaks(
        electionDefinition,
        'ballot-style-1',
        'precinct-1',
        votes,
        'mark'
      );

      expect(result.totalPages).toEqual(1);
      expect(result.pages.length).toEqual(1);
      expect(result.pages[0].contestIds.length).toEqual(5);
    } finally {
      await renderer.close();
    }
  });

  test('computes multiple pages for large election', async () => {
    const election = createTestElection({
      numCandidateContests: 20,
      numYesNoContests: 10,
      candidatesPerContest: 6,
      longCandidateNames: true,
      longContestTitles: true,
    });
    const electionDefinition = createElectionDefinition(election);
    const votes = createMockVotes([...election.contests]);

    const renderer = new SummaryBallotLayoutRenderer();
    try {
      const result = await renderer.computePageBreaks(
        electionDefinition,
        'ballot-style-1',
        'precinct-1',
        votes,
        'mark'
      );

      expect(result.totalPages).toBeGreaterThan(1);
      expect(result.pages.length).toEqual(result.totalPages);

      // Verify all contests are accounted for
      const allContestIds = result.pages.flatMap((p) => p.contestIds);
      expect(allContestIds.length).toEqual(30);
    } finally {
      await renderer.close();
    }
  });

  test('handles election with long yes/no option labels', async () => {
    const election = createTestElection({
      numCandidateContests: 5,
      numYesNoContests: 15,
      candidatesPerContest: 4,
      longYesNoLabels: true,
    });
    const electionDefinition = createElectionDefinition(election);
    const votes = createMockVotes([...election.contests]);

    const renderer = new SummaryBallotLayoutRenderer();
    try {
      const result = await renderer.computePageBreaks(
        electionDefinition,
        'ballot-style-1',
        'precinct-1',
        votes,
        'mark'
      );

      // With long yes/no labels, we expect multiple pages
      expect(result.totalPages).toBeGreaterThan(1);
    } finally {
      await renderer.close();
    }
  });
});

describe('computeSummaryBallotLayoutWithRendering', () => {
  test('computes page breaks using convenience function', async () => {
    const election = createTestElection({
      numCandidateContests: 35,
      numYesNoContests: 15,
      candidatesPerContest: 5,
      longCandidateNames: true,
      longContestTitles: true,
    });
    const electionDefinition = createElectionDefinition(election);
    const votes = createMockVotes([...election.contests]);

    const result = await computeSummaryBallotLayoutWithRendering(
      electionDefinition,
      'ballot-style-1' as BallotStyleId,
      'precinct-1',
      votes,
      'mark'
    );

    // With 50 contests, we expect multiple pages
    expect(result.totalPages).toBeGreaterThan(1);
    expect(result.pages.length).toEqual(result.totalPages);

    // Verify all contests are accounted for
    const allContestIds = result.pages.flatMap((p) => p.contestIds);
    expect(allContestIds.length).toEqual(election.contests.length);
  });
});

describe('Multi-page summary ballot visual snapshots', () => {
  async function renderMultiPageBallot(
    electionDefinition: ElectionDefinition,
    pageBreaks: SummaryBallotLayoutResult,
    votes: VotesDict
  ): Promise<Uint8Array[]> {
    const { election } = electionDefinition;
    const ballotAuditId = 'test-ballot-audit-id';
    const pdfs: Uint8Array[] = [];

    for (const pageBreak of pageBreaks.pages) {
      const pageContests = election.contests.filter((c) =>
        pageBreak.contestIds.includes(c.id)
      );
      const pageVotes = filterVotesForContests(votes, pageContests);

      const ballot = (
        <VxThemeProvider colorMode="contrastHighLight" sizeMode="touchSmall">
          <GlobalStyles />
          <BmdPaperBallot
            electionDefinition={electionDefinition}
            ballotStyleId="ballot-style-1"
            precinctId="precinct-1"
            votes={pageVotes}
            isLiveMode={false}
            machineType="mark"
            pageNumber={pageBreak.pageNumber}
            totalPages={pageBreaks.totalPages}
            ballotAuditId={ballotAuditId}
            contestsForPage={pageContests}
            layout={pageBreak.layout}
          />
        </VxThemeProvider>
      );

      const pdfData = (await renderToPdf({ document: ballot })).unsafeUnwrap();
      pdfs.push(pdfData);
    }

    return pdfs;
  }

  test('renders 2-page ballot with medium election', async () => {
    const election = createTestElection({
      numCandidateContests: 15,
      numYesNoContests: 5,
      candidatesPerContest: 5,
    });
    const electionDefinition = createElectionDefinition(election);
    const votes = createMockVotes([...election.contests]);

    const renderer = new SummaryBallotLayoutRenderer();
    let pageBreaks: SummaryBallotLayoutResult;
    try {
      pageBreaks = await renderer.computePageBreaks(
        electionDefinition,
        'ballot-style-1',
        'precinct-1',
        votes,
        'mark'
      );
    } finally {
      await renderer.close();
    }
    const pdfs = await renderMultiPageBallot(
      electionDefinition,
      pageBreaks,
      votes
    );

    // Convert PDFs to images and snapshot test each page
    for (let i = 0; i < pdfs.length; i += 1) {
      const pdf = pdfs[i];
      const pages = await iter(pdfToImages(pdf, { scale: 200 / 72 }))
        .map((page) => toImageBuffer(page.page))
        .toArray();

      expect(pages.length).toEqual(1);
      expect(pages[0]).toMatchImageSnapshot({
        customSnapshotIdentifier: `medium-election-page-${i + 1}-of-${
          pdfs.length
        }`,
        failureThreshold: 0.01,
        failureThresholdType: 'percent',
      });
    }
  });

  test('renders 3+ page ballot with large election', async () => {
    const election = createTestElection({
      numCandidateContests: 25,
      numYesNoContests: 10,
      candidatesPerContest: 6,
      longCandidateNames: true,
      longContestTitles: true,
    });
    const electionDefinition = createElectionDefinition(election);
    const votes = createMockVotes([...election.contests]);

    const renderer = new SummaryBallotLayoutRenderer();
    let pageBreaks: SummaryBallotLayoutResult;
    try {
      pageBreaks = await renderer.computePageBreaks(
        electionDefinition,
        'ballot-style-1',
        'precinct-1',
        votes,
        'mark'
      );
    } finally {
      await renderer.close();
    }

    expect(pageBreaks.totalPages).toBeGreaterThanOrEqual(2);
    const pdfs = await renderMultiPageBallot(
      electionDefinition,
      pageBreaks,
      votes
    );

    // Convert PDFs to images and snapshot test each page
    for (let i = 0; i < pdfs.length; i += 1) {
      const pdf = pdfs[i];
      const pages = await iter(pdfToImages(pdf, { scale: 200 / 72 }))
        .map((page) => toImageBuffer(page.page))
        .toArray();

      expect(pages.length).toEqual(1);
      expect(pages[0]).toMatchImageSnapshot({
        customSnapshotIdentifier: `large-election-page-${i + 1}-of-${
          pdfs.length
        }`,
        failureThreshold: 0.01,
        failureThresholdType: 'percent',
      });
    }
  });

  test('renders ballot with long yes/no labels', async () => {
    const election = createTestElection({
      numCandidateContests: 5,
      numYesNoContests: 12,
      candidatesPerContest: 4,
      longYesNoLabels: true,
    });
    const electionDefinition = createElectionDefinition(election);
    const votes = createMockVotes([...election.contests]);

    const renderer = new SummaryBallotLayoutRenderer();
    let pageBreaks: SummaryBallotLayoutResult;
    try {
      pageBreaks = await renderer.computePageBreaks(
        electionDefinition,
        'ballot-style-1',
        'precinct-1',
        votes,
        'mark'
      );
    } finally {
      await renderer.close();
    }
    const pdfs = await renderMultiPageBallot(
      electionDefinition,
      pageBreaks,
      votes
    );

    // Convert PDFs to images and snapshot test each page
    for (let i = 0; i < pdfs.length; i += 1) {
      const pdf = pdfs[i];
      const pages = await iter(pdfToImages(pdf, { scale: 200 / 72 }))
        .map((page) => toImageBuffer(page.page))
        .toArray();

      expect(pages.length).toEqual(1);
      expect(pages[0]).toMatchImageSnapshot({
        customSnapshotIdentifier: `long-yesno-labels-page-${i + 1}-of-${
          pdfs.length
        }`,
        failureThreshold: 0.01,
        failureThresholdType: 'percent',
      });
    }
  });
});

describe('Medium-large election summary ballot test deck', () => {
  /**
   * Creates a medium-large election with 50 contests for testing multi-page ballots.
   */
  function createMediumLargeElection(): {
    electionDefinition: ElectionDefinition;
    votes: VotesDict;
  } {
    const election = createTestElection({
      numCandidateContests: 35,
      numYesNoContests: 15,
      candidatesPerContest: 5,
      longCandidateNames: true,
      longContestTitles: true,
    });
    const electionDefinition = createElectionDefinition(election);
    const votes = createMockVotes([...election.contests]);

    return { electionDefinition, votes };
  }

  test('computes page breaks for medium-large election', async () => {
    const { electionDefinition, votes } = createMediumLargeElection();

    const renderer = new SummaryBallotLayoutRenderer();
    let pageBreaks: SummaryBallotLayoutResult;
    try {
      pageBreaks = await renderer.computePageBreaks(
        electionDefinition,
        'ballot-style-1',
        'precinct-1',
        votes,
        'mark'
      );
    } finally {
      await renderer.close();
    }

    // With 50 contests, we expect multiple pages
    expect(pageBreaks.totalPages).toBeGreaterThan(1);
    expect(pageBreaks.pages.length).toEqual(pageBreaks.totalPages);

    // Verify all contests are accounted for
    const allContestIds = pageBreaks.pages.flatMap((p) => p.contestIds);
    const { election } = electionDefinition;
    expect(allContestIds.length).toEqual(election.contests.length);
  });

  test('renders summary ballot test deck for medium-large election', async () => {
    const { electionDefinition, votes } = createMediumLargeElection();

    const renderer = new SummaryBallotLayoutRenderer();
    let pageBreaks: SummaryBallotLayoutResult;
    try {
      pageBreaks = await renderer.computePageBreaks(
        electionDefinition,
        'ballot-style-1',
        'precinct-1',
        votes,
        'mark'
      );
    } finally {
      await renderer.close();
    }

    const { election } = electionDefinition;
    const ballotAuditId = 'test-ballot-audit-id';
    const pdfs: Uint8Array[] = [];

    for (const pageBreak of pageBreaks.pages) {
      const pageContests = election.contests.filter((c) =>
        pageBreak.contestIds.includes(c.id)
      );
      const pageVotes = filterVotesForContests(votes, pageContests);

      const ballot = (
        <VxThemeProvider colorMode="contrastHighLight" sizeMode="touchSmall">
          <GlobalStyles />
          <BmdPaperBallot
            electionDefinition={electionDefinition}
            ballotStyleId="ballot-style-1"
            precinctId="precinct-1"
            votes={pageVotes}
            isLiveMode={false}
            machineType="mark"
            pageNumber={pageBreak.pageNumber}
            totalPages={pageBreaks.totalPages}
            ballotAuditId={ballotAuditId}
            contestsForPage={pageContests}
            layout={pageBreak.layout}
          />
        </VxThemeProvider>
      );

      const pdfData = (await renderToPdf({ document: ballot })).unsafeUnwrap();
      pdfs.push(pdfData);
    }

    // Verify each page renders successfully and content fits on one PDF page
    for (let i = 0; i < pdfs.length; i += 1) {
      const pdf = pdfs[i];
      const pages = await iter(pdfToImages(pdf, { scale: 200 / 72 }))
        .map((page) => toImageBuffer(page.page))
        .toArray();

      // Each ballot page should produce exactly 1 PDF page
      expect(pages.length).toEqual(1);
      expect(pages[0]).toMatchImageSnapshot({
        customSnapshotIdentifier: `medium-large-election-page-${i + 1}-of-${
          pdfs.length
        }`,
        failureThreshold: 0.01,
        failureThresholdType: 'percent',
      });
    }
  }, 120000);
});
