import React from 'react';
import { Browser, Page, chromium } from 'playwright';
import ReactDom from 'react-dom/server';
import { ServerStyleSheet } from 'styled-components';
import { assert } from '@votingworks/basics';
import {
  BallotStyleId,
  ContestId,
  Contests,
  ElectionDefinition,
  getBallotStyle,
  getContests,
  VotesDict,
} from '@votingworks/types';
import {
  Layout,
  MachineType,
  ORDERED_BMD_BALLOT_LAYOUTS,
  BmdPaperBallot,
  GlobalStyles,
  VxThemeProvider,
  ROBOTO_REGULAR_FONT_DECLARATIONS,
  ROBOTO_ITALIC_FONT_DECLARATIONS,
  FONT_AWESOME_STYLES,
  filterVotesForContests,
} from '@votingworks/ui';
import { OPTIONAL_EXECUTABLE_PATH_OVERRIDE } from './chromium';

/**
 * Represents a single page of a summary ballot layout.
 */
export interface SummaryBallotPageLayout {
  pageNumber: number;
  contestIds: ContestId[];
  layout: Layout;
}

/**
 * Result of computing page breaks for a summary ballot.
 */
export interface SummaryBallotLayoutResult {
  pages: SummaryBallotPageLayout[];
  totalPages: number;
}

const PLAYWRIGHT_PIXELS_PER_INCH = 96;
const CONTENT_WRAPPER_ID = 'summary-ballot-measure';

/**
 * Paper dimensions for summary ballots.
 * These MUST match the dimensions used in render.tsx for PDF generation.
 */
const PAPER_CONFIG = {
  width: 8.5,
  height: 11,
  // Match DEFAULT_MARGIN_DIMENSIONS from render.tsx
  marginTop: 0.5,
  marginBottom: 0.5,
  marginLeft: 0.5,
  marginRight: 0.5,
} as const;

/**
 * Available content width in pixels after accounting for margins.
 */
function getAvailableWidthPixels(): number {
  const availableWidth =
    PAPER_CONFIG.width - PAPER_CONFIG.marginLeft - PAPER_CONFIG.marginRight;
  return availableWidth * PLAYWRIGHT_PIXELS_PER_INCH;
}

/**
 * Available content height in pixels after accounting for margins.
 */
function getAvailableHeightPixels(): number {
  const availableHeight =
    PAPER_CONFIG.height - PAPER_CONFIG.marginTop - PAPER_CONFIG.marginBottom;
  return availableHeight * PLAYWRIGHT_PIXELS_PER_INCH;
}

/**
 * Selects the appropriate layout for contest count and machine type.
 */
function selectLayout(contestCount: number, machineType: MachineType): Layout {
  const layouts = [...ORDERED_BMD_BALLOT_LAYOUTS[machineType]].reverse();
  const layout = layouts.find((l) => contestCount >= l.minContests);
  return layout ?? layouts[layouts.length - 1];
}

/**
 * Renders a summary ballot page and returns the content height in pixels.
 */
async function measureBallotHeight(
  page: Page,
  electionDefinition: ElectionDefinition,
  ballotStyleId: BallotStyleId,
  precinctId: string,
  contests: Contests,
  votes: VotesDict,
  machineType: MachineType,
  isMultiPage: boolean,
  totalContestCount: number,
  pageNumber?: number,
  totalPages?: number
): Promise<number> {
  // Use total contest count for layout selection, not just the contests on this page
  const layout = selectLayout(totalContestCount, machineType);
  // Filter votes to only include contests being measured
  const filteredVotes = filterVotesForContests(votes, contests);

  const ballot = (
    <BmdPaperBallot
      electionDefinition={electionDefinition}
      ballotStyleId={ballotStyleId}
      precinctId={precinctId}
      votes={filteredVotes}
      isLiveMode={false}
      machineType={machineType}
      layout={layout}
      pageNumber={isMultiPage ? pageNumber : undefined}
      totalPages={isMultiPage ? totalPages : undefined}
      ballotAuditId={isMultiPage ? 'measurement-ballot' : undefined}
      contestsForPage={isMultiPage ? contests : undefined}
    />
  );

  // Render with styles - must match renderToPdf theme settings
  // renderToPdf uses 'desktop' theme by default, but BmdPaperBallot internally
  // wraps with 'touchSmall' via withPrintTheme(), so we match that structure
  const sheet = new ServerStyleSheet();
  const elementHtml = ReactDom.renderToString(
    sheet.collectStyles(
      <VxThemeProvider
        colorMode="desktop"
        sizeMode="desktop"
        screenType="builtIn"
      >
        <GlobalStyles />
        <div id={CONTENT_WRAPPER_ID}>{ballot}</div>
      </VxThemeProvider>
    )
  );
  const styleElement = sheet.getStyleElement();
  sheet.seal();

  const documentHtml = ReactDom.renderToString(
    <html>
      <head>
        <style
          type="text/css"
          dangerouslySetInnerHTML={{
            __html: [
              ROBOTO_REGULAR_FONT_DECLARATIONS,
              ROBOTO_ITALIC_FONT_DECLARATIONS,
            ].join('\n'),
          }}
        />
        <style
          type="text/css"
          dangerouslySetInnerHTML={{ __html: FONT_AWESOME_STYLES }}
        />
        {styleElement}
      </head>
      <body dangerouslySetInnerHTML={{ __html: elementHtml }} />
    </html>
  );

  // Set viewport to match paper dimensions (must match render.tsx)
  await page.setViewportSize({
    width: Math.floor(getAvailableWidthPixels()),
    height: Math.floor(getAvailableHeightPixels()),
  });

  await page.setContent(`<!DOCTYPE html>\n${documentHtml}`, {
    waitUntil: 'load',
  });

  // Measure actual content height
  const contentHeight = await page.evaluate((wrapperId: string) => {
    const wrapper = document.getElementById(wrapperId);
    if (!wrapper) return 0;
    const rect = wrapper.getBoundingClientRect();
    return rect.height;
  }, CONTENT_WRAPPER_ID);

  return contentHeight;
}

/**
 * Binary search to find maximum contests that fit on a page.
 */
async function findMaxContestsThatFit(
  page: Page,
  electionDefinition: ElectionDefinition,
  ballotStyleId: BallotStyleId,
  precinctId: string,
  contests: Contests,
  votes: VotesDict,
  machineType: MachineType,
  isMultiPage: boolean,
  totalContestCount: number
): Promise<number> {
  const availableHeight = getAvailableHeightPixels();

  // Quick check: do all contests fit?
  const allContestsHeight = await measureBallotHeight(
    page,
    electionDefinition,
    ballotStyleId,
    precinctId,
    contests,
    votes,
    machineType,
    isMultiPage,
    totalContestCount,
    1,
    1
  );

  if (allContestsHeight <= availableHeight) {
    return contests.length;
  }

  // Binary search for the maximum that fits
  let low = 1;
  let high = contests.length - 1;
  let bestFit = 1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const testContests = contests.slice(0, mid) as Contests;

    const height = await measureBallotHeight(
      page,
      electionDefinition,
      ballotStyleId,
      precinctId,
      testContests,
      votes,
      machineType,
      isMultiPage,
      totalContestCount,
      1,
      2
    );

    if (height <= availableHeight) {
      bestFit = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return bestFit;
}

/**
 * Renderer class that manages browser lifecycle for measuring ballots.
 */
export class SummaryBallotLayoutRenderer {
  private browser: Browser | null = null;
  private page: Page | null = null;

  async initialize(): Promise<void> {
    if (!this.browser) {
      this.browser = await chromium.launch({
        args: ['--font-render-hinting=none'],
        executablePath: OPTIONAL_EXECUTABLE_PATH_OVERRIDE,
      });
      const context = await this.browser.newContext();
      this.page = await context.newPage();
    }
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
    }
  }

  /**
   * Computes page breaks by actually rendering and measuring ballot content
   * with the given votes.
   */
  async computePageBreaks(
    electionDefinition: ElectionDefinition,
    ballotStyleId: BallotStyleId,
    precinctId: string,
    votes: VotesDict,
    machineType: MachineType
  ): Promise<SummaryBallotLayoutResult> {
    await this.initialize();
    assert(this.page, 'Page not initialized');

    const { election } = electionDefinition;
    const ballotStyle = getBallotStyle({ ballotStyleId, election });
    assert(ballotStyle, `invalid ballot style: ${ballotStyleId}`);
    const contests = getContests({ ballotStyle, election });
    const totalContestCount = contests.length;

    // Check if single page is sufficient
    const singlePageHeight = await measureBallotHeight(
      this.page,
      electionDefinition,
      ballotStyleId,
      precinctId,
      contests,
      votes,
      machineType,
      false,
      totalContestCount
    );

    if (singlePageHeight <= getAvailableHeightPixels()) {
      const layout = selectLayout(totalContestCount, machineType);
      return {
        pages: [
          {
            pageNumber: 1,
            contestIds: contests.map((c) => c.id),
            layout,
          },
        ],
        totalPages: 1,
      };
    }

    // Multi-page layout needed
    const pages: SummaryBallotPageLayout[] = [];
    let remainingContests = [...contests] as Contests;
    let pageNumber = 1;
    // Use total contest count for consistent layout across all pages
    const layout = selectLayout(totalContestCount, machineType);

    while (remainingContests.length > 0) {
      const maxFit = await findMaxContestsThatFit(
        this.page,
        electionDefinition,
        ballotStyleId,
        precinctId,
        remainingContests,
        votes,
        machineType,
        true,
        totalContestCount
      );

      const pageContests = remainingContests.slice(0, maxFit) as Contests;

      pages.push({
        pageNumber,
        contestIds: pageContests.map((c) => c.id),
        layout,
      });

      remainingContests = remainingContests.slice(maxFit) as Contests;
      pageNumber += 1;

      if (pageNumber > 20) {
        throw new Error(
          `Too many pages computed for ballot style ${ballotStyleId}`
        );
      }
    }

    return {
      pages,
      totalPages: pages.length,
    };
  }
}

/**
 * Convenience function to compute page breaks for a single ballot.
 */
export async function computeSummaryBallotLayoutWithRendering(
  electionDefinition: ElectionDefinition,
  ballotStyleId: BallotStyleId,
  precinctId: string,
  votes: VotesDict,
  machineType: MachineType
): Promise<SummaryBallotLayoutResult> {
  const renderer = new SummaryBallotLayoutRenderer();
  try {
    return await renderer.computePageBreaks(
      electionDefinition,
      ballotStyleId,
      precinctId,
      votes,
      machineType
    );
  } finally {
    await renderer.close();
  }
}
