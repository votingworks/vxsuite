import { describe, expect, test } from 'vitest';
import React from 'react';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { iter } from '@votingworks/basics';
import {
  AnyContest,
  BallotStyle,
  CandidateContest,
  District,
  Election,
  ElectionDefinition,
  getContests,
  getBallotStyle,
  HmpbBallotPaperSize,
  Party,
  Precinct,
  safeParseElectionDefinition,
  VotesDict,
  YesNoContest,
} from '@votingworks/types';
import { pdfToImages, toImageBuffer } from '@votingworks/image-utils';
import {
  BmdPaperBallot,
  filterVotesForContests,
  VxThemeProvider,
  GlobalStyles,
} from '@votingworks/ui';
import {
  SummaryBallotLayoutRenderer,
  SummaryBallotLayoutResult,
} from './summary_ballot_layout';
import { renderToPdf } from './render';

/**
 * Creates a test election with a configurable number of contests.
 * This is used to test multi-page summary ballot layouts.
 */
function createTestElection(options: {
  numCandidateContests: number;
  numYesNoContests: number;
  candidatesPerContest: number;
  longCandidateNames?: boolean;
  longContestTitles?: boolean;
  longYesNoLabels?: boolean;
}): Election {
  const {
    numCandidateContests,
    numYesNoContests,
    candidatesPerContest,
    longCandidateNames = false,
    longContestTitles = false,
    longYesNoLabels = false,
  } = options;

  const district: District = {
    id: 'district-1',
    name: 'Test District',
  };

  const precinct: Precinct = {
    id: 'precinct-1',
    name: 'Test Precinct',
    districtIds: [district.id],
  };

  const party: Party = {
    id: 'party-1',
    name: 'Test Party',
    fullName: 'Test Party',
    abbrev: 'TP',
  };

  const contests: AnyContest[] = [];

  // Generate candidate contests
  for (let i = 0; i < numCandidateContests; i += 1) {
    const contestTitle = longContestTitles
      ? `Office of the Commissioner for Long Department Name Number ${i + 1}`
      : `Office ${i + 1}`;

    const candidateContest: CandidateContest = {
      id: `candidate-contest-${i}`,
      type: 'candidate',
      districtId: district.id,
      title: contestTitle,
      seats: 1,
      allowWriteIns: true,
      candidates: Array.from({ length: candidatesPerContest }, (_, j) => ({
        id: `candidate-${i}-${j}`,
        name: longCandidateNames
          ? `Candidate With A Very Long Name For Testing Purposes Number ${
              j + 1
            }`
          : `Candidate ${j + 1}`,
        partyIds: [party.id],
      })),
    };
    contests.push(candidateContest);
  }

  // Generate yes/no contests
  for (let i = 0; i < numYesNoContests; i += 1) {
    const yesNoContest: YesNoContest = {
      id: `yesno-contest-${i}`,
      type: 'yesno',
      districtId: district.id,
      title: longContestTitles
        ? `Proposition ${
            i + 1
          }: Amendment to the State Constitution Regarding Important Matter`
        : `Proposition ${i + 1}`,
      description: `This is a description for proposition ${
        i + 1
      }. It explains what the proposition does.`,
      yesOption: {
        id: `yesno-${i}-yes`,
        label: longYesNoLabels
          ? `Yes, I approve of this proposition and all of its amendments and changes to the existing law`
          : `Yes`,
      },
      noOption: {
        id: `yesno-${i}-no`,
        label: longYesNoLabels
          ? `No, I do not approve of this proposition and prefer the current law to remain unchanged`
          : `No`,
      },
    };
    contests.push(yesNoContest);
  }

  const ballotStyle: BallotStyle = {
    id: 'ballot-style-1',
    groupId: 'ballot-style-1',
    precincts: [precinct.id],
    districts: [district.id],
  };

  const election: Election = {
    id: 'test-election',
    type: 'general',
    title: 'Test Election for Multi-Page Summary Ballots',
    date: '2024-11-05',
    state: 'Test State',
    county: {
      id: 'county-1',
      name: 'Test County',
    },
    seal: '',
    parties: [party],
    districts: [district],
    precincts: [precinct],
    ballotStyles: [ballotStyle],
    contests,
    ballotLayout: {
      metadataEncoding: 'qr-code',
      paperSize: HmpbBallotPaperSize.Letter,
    },
    ballotStrings: {},
  };

  return election;
}

function createElectionDefinition(election: Election): ElectionDefinition {
  const electionData = JSON.stringify(election);
  return safeParseElectionDefinition(electionData).unsafeUnwrap();
}

/**
 * Creates mock votes selecting the first option for each contest.
 */
function createMockVotes(
  contests: AnyContest[],
  contestIds?: string[]
): VotesDict {
  const filteredContests = contestIds
    ? contests.filter((c) => contestIds.includes(c.id))
    : contests;

  const votes: VotesDict = {};
  for (const contest of filteredContests) {
    if (contest.type === 'candidate') {
      votes[contest.id] = contest.candidates.slice(0, contest.seats);
    } else {
      votes[contest.id] = [contest.yesOption.id];
    }
  }
  return votes;
}

describe('SummaryBallotLayoutRenderer', () => {
  test('computes single page for small election', async () => {
    const election = createTestElection({
      numCandidateContests: 3,
      numYesNoContests: 2,
      candidatesPerContest: 4,
    });
    const electionDefinition = createElectionDefinition(election);
    const votes = createMockVotes(election.contests);

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
    const votes = createMockVotes(election.contests);

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
    const votes = createMockVotes(election.contests);

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
    const votes = createMockVotes(election.contests);

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
    const votes = createMockVotes(election.contests);

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
    const votes = createMockVotes(election.contests);

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
   * Loads the testMediumLargeElection.json fixture and creates votes for each contest.
   */
  function loadMediumLargeElectionFixture(): {
    electionDefinition: ElectionDefinition;
    votes: VotesDict;
  } {
    const fixturePath = path.resolve(
      __dirname,
      '../../fixture-generators/testMediumLargeElection.json'
    );
    const electionData = fs.readFileSync(fixturePath, 'utf8');
    const electionDefinition =
      safeParseElectionDefinition(electionData).unsafeUnwrap();
    const { election } = electionDefinition;

    // Get contests for the ballot style
    const ballotStyle = getBallotStyle({
      ballotStyleId: 'ballot-style-0',
      election,
    });
    if (!ballotStyle) {
      throw new Error('Ballot style not found');
    }
    const contests = getContests({ ballotStyle, election });

    // Generate votes selecting the first option for each contest
    const votes: VotesDict = {};
    for (const contest of contests) {
      if (contest.type === 'candidate') {
        votes[contest.id] = contest.candidates.slice(0, contest.seats);
      } else {
        votes[contest.id] = [contest.yesOption.id];
      }
    }

    return { electionDefinition, votes };
  }

  test('computes page breaks for medium-large election', async () => {
    const { electionDefinition, votes } = loadMediumLargeElectionFixture();

    const renderer = new SummaryBallotLayoutRenderer();
    let pageBreaks: SummaryBallotLayoutResult;
    try {
      pageBreaks = await renderer.computePageBreaks(
        electionDefinition,
        'ballot-style-0',
        'precinct-0',
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
    const ballotStyle = getBallotStyle({
      ballotStyleId: 'ballot-style-0',
      election,
    });
    const contests = getContests({ ballotStyle: ballotStyle!, election });
    expect(allContestIds.length).toEqual(contests.length);

    // Log the page breakdown for debugging
    // eslint-disable-next-line no-console
    console.log(
      `Medium-large election: ${pageBreaks.totalPages} pages for ${contests.length} contests`
    );
    for (const page of pageBreaks.pages) {
      // eslint-disable-next-line no-console
      console.log(
        `  Page ${page.pageNumber}: ${page.contestIds.length} contests`
      );
    }
  });

  test('renders summary ballot test deck for medium-large election', async () => {
    const { electionDefinition, votes } = loadMediumLargeElectionFixture();

    const renderer = new SummaryBallotLayoutRenderer();
    let pageBreaks: SummaryBallotLayoutResult;
    try {
      pageBreaks = await renderer.computePageBreaks(
        electionDefinition,
        'ballot-style-0',
        'precinct-0',
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
            ballotStyleId="ballot-style-0"
            precinctId="precinct-0"
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
