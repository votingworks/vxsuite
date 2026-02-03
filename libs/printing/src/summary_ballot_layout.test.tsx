import { describe, expect, test, vi } from 'vitest';
import {
  BallotStyleId,
  ElectionDefinition,
  VotesDict,
} from '@votingworks/types';
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
  SummaryBallotPageLayout,
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

      expect(result.length).toEqual(1);
      expect(result[0].contestIds.length).toEqual(5);
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

      expect(result.length).toBeGreaterThan(1);

      // Verify all contests are accounted for
      const allContestIds = result.flatMap((p) => p.contestIds);
      expect(allContestIds.length).toEqual(30);
    } finally {
      await renderer.close();
    }
  });

  test('knownMinPages > 1 skips single-page check and produces same result with fewer measurements', async () => {
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
      const args = [
        electionDefinition,
        'ballot-style-1',
        'precinct-1',
        votes,
        'mark',
      ] as const;

      // First call initializes the browser and produces the baseline result
      const resultWithout = await renderer.computePageBreaks(...args);
      expect(resultWithout.length).toBeGreaterThan(1);

      // Spy on page.setContent to count measurement renders
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { page } = renderer as any;
      const setContentSpy = vi.spyOn(page, 'setContent');

      // Call without knownMinPages — includes the single-page check
      await renderer.computePageBreaks(...args);
      const callsWithout = setContentSpy.mock.calls.length;

      setContentSpy.mockClear();

      // Call with knownMinPages — skips the single-page check
      const resultWith = await renderer.computePageBreaks(
        ...args,
        undefined,
        2
      );
      const callsWith = setContentSpy.mock.calls.length;

      // Should produce the same page layout
      expect(resultWith).toEqual(resultWithout);

      // But with fewer measurement renders (the single-page check is skipped)
      expect(callsWith).toBeLessThan(callsWithout);
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
      expect(result.length).toBeGreaterThan(1);
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
    expect(result.length).toBeGreaterThan(1);

    // Verify all contests are accounted for
    const allContestIds = result.flatMap((p) => p.contestIds);
    expect(allContestIds.length).toEqual(election.contests.length);
  });
});

describe('Multi-page summary ballot visual snapshots', () => {
  async function renderMultiPageBallot(
    electionDefinition: ElectionDefinition,
    pageBreaks: SummaryBallotPageLayout[],
    votes: VotesDict
  ): Promise<Uint8Array[]> {
    const { election } = electionDefinition;
    const ballotAuditId = 'test-ballot-audit-id';
    const pdfs: Uint8Array[] = [];

    for (const pageBreak of pageBreaks) {
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
            totalPages={pageBreaks.length}
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
    let pageBreaks: SummaryBallotPageLayout[];
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

    for (let i = 0; i < pdfs.length; i += 1) {
      const pdf = pdfs[i];
      await expect(pdf).toMatchPdfSnapshot({
        customSnapshotIdentifier: `medium-election-page-${i + 1}-of-${
          pdfs.length
        }`,
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
    let pageBreaks: SummaryBallotPageLayout[];
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

    expect(pageBreaks.length).toBeGreaterThanOrEqual(2);
    const pdfs = await renderMultiPageBallot(
      electionDefinition,
      pageBreaks,
      votes
    );

    // Convert PDFs to images and snapshot test each page
    for (let i = 0; i < pdfs.length; i += 1) {
      const pdf = pdfs[i];
      await expect(pdf).toMatchPdfSnapshot({
        customSnapshotIdentifier: `large-election-page-${i + 1}-of-${
          pdfs.length
        }`,
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
    let pageBreaks: SummaryBallotPageLayout[];
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
      await expect(pdf).toMatchPdfSnapshot({
        customSnapshotIdentifier: `long-yesno-labels-page-${i + 1}-of-${
          pdfs.length
        }`,
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
    let pageBreaks: SummaryBallotPageLayout[];
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
    expect(pageBreaks.length).toBeGreaterThan(1);

    // Verify all contests are accounted for
    const allContestIds = pageBreaks.flatMap((p) => p.contestIds);
    const { election } = electionDefinition;
    expect(allContestIds.length).toEqual(election.contests.length);
  });

  test('renders summary ballot test deck for medium-large election', async () => {
    const { electionDefinition, votes } = createMediumLargeElection();

    const renderer = new SummaryBallotLayoutRenderer();
    let pageBreaks: SummaryBallotPageLayout[];
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

    for (const pageBreak of pageBreaks) {
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
            totalPages={pageBreaks.length}
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
      await expect(pdf).toMatchPdfSnapshot({
        customSnapshotIdentifier: `medium-large-election-page-${i + 1}-of-${
          pdfs.length
        }`,
      });
    }
  }, 120000);
});
