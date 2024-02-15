import { assertDefined, iter, range } from '@votingworks/basics';
import React from 'react';
import styled from 'styled-components';
import { BallotPageTemplate, PagedElementResult } from './render_ballot';
import { RenderScratchpad } from './renderer';
import {
  Bubble,
  Page,
  QrCodeSlot,
  TIMING_MARK_DIMENSIONS,
  TimingMark,
} from './ballot_components';
import { InchDimensions, PixelDimensions } from './types';

export interface MiniElection {
  title: string;
  contests: Array<{
    title: string;
    candidates: string[];
  }>;
}

export const pageDimensions: InchDimensions = {
  width: 8.5,
  height: 11,
};

export const pageMargins = {
  top: 0.125,
  right: 0.125,
  bottom: 0.125,
  left: 0.125,
} as const;

function TimingMarkGrid({ children }: { children: React.ReactNode }) {
  const columnsPerInch = 4;
  const rowsPerInch = 4;

  const gridRows = pageDimensions.height * rowsPerInch - 3;
  const gridColumns = pageDimensions.width * columnsPerInch;

  const timingMarkRow = (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
      }}
    >
      {range(0, gridColumns).map((i) => (
        <TimingMark key={i} />
      ))}
    </div>
  );
  const timingMarkColumn = (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        position: 'relative',
        top: `-${TIMING_MARK_DIMENSIONS.height}in`,
        height: `calc(100% + ${2 * TIMING_MARK_DIMENSIONS.height}in)`,
      }}
    >
      {range(0, gridRows).map((i) => (
        <TimingMark key={i} />
      ))}
    </div>
  );

  return (
    <div
      style={{
        height: '100%',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {timingMarkRow}
      <div style={{ flex: 1, display: 'flex' }}>
        {timingMarkColumn}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            padding: '0.1in',
          }}
        >
          {children}
        </div>
        {timingMarkColumn}
      </div>
      {timingMarkRow}
    </div>
  );
}

function Header({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: '1rem', border: '1px solid black' }}>{children}</div>
  );
}

function Footer({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: '1rem',
        border: '1px solid black',
        display: 'flex',
        justifyContent: 'space-between',
      }}
    >
      {children}
      <div>
        <QrCodeSlot />
      </div>
    </div>
  );
}

const ContestBox = styled.div`
  background-color: #eee;
  border: 1px solid black;
  padding: 1rem;
`;

function Contest({ contest }: { contest: MiniElection['contests'][0] }) {
  return (
    <ContestBox className="contest">
      <div>{contest.title}</div>
      <ul style={{ listStyleType: 'none' }}>
        {contest.candidates.map((candidate) => (
          <li key={candidate}>
            <Bubble contestId={contest.title} optionId={candidate} />{' '}
            {candidate}
          </li>
        ))}
      </ul>
    </ContestBox>
  );
}

function BallotPageFrame({
  election,
  pageNumber,
  totalPages,
  children,
}: {
  election: MiniElection;
  pageNumber: number;
  totalPages: number;
  children: JSX.Element;
}): JSX.Element {
  return (
    <Page
      key={pageNumber}
      pageNumber={pageNumber}
      dimensions={pageDimensions}
      margins={pageMargins}
    >
      <TimingMarkGrid>
        {pageNumber % 2 === 1 && <Header>{election.title}</Header>}
        <div style={{ flex: 1 }}>{children}</div>
        <Footer>
          Page: {pageNumber}/{totalPages}
        </Footer>
      </TimingMarkGrid>
    </Page>
  );
}

/**
 * Here we use a simple single-column layout, but we could also use more complex
 * algorithms. The key is that the template has full control to determine:
 * - How many contests fit on each page
 * - How to lay out those contests
 * We can use this approach to implement complex behavior such as contest
 * sections and multi-column layouts.
 */
async function BallotPageContent(
  {
    election,
    dimensions,
  }: {
    election: MiniElection;
    dimensions: PixelDimensions;
  },
  scratchpad: RenderScratchpad
): Promise<PagedElementResult<{ election: MiniElection }>> {
  const contestElements = election.contests.map((contest) => (
    <Contest key={contest.title} contest={contest} />
  ));

  const contestMeasurements = await scratchpad.measureElements(
    <>
      {contestElements.map((contest, i) => (
        <div
          className="contestWrapper"
          key={i}
          style={{ width: dimensions.width }}
        >
          {contest}
        </div>
      ))}
    </>,
    '.contestWrapper'
  );
  const measuredContests = iter(contestElements)
    .zip(contestMeasurements)
    .map(([element, measurements]) => ({ element, ...measurements }))
    .toArray();

  // Add as many contests on this page as will fit.
  const pageContests: React.ReactNode[] = [];
  let heightUsed = 0;
  while (measuredContests.length > 0) {
    const nextContestHeight = measuredContests[0].height;
    if (heightUsed + nextContestHeight > dimensions.height) {
      break;
    }
    const nextContest = assertDefined(measuredContests.shift());
    pageContests.push(nextContest.element);
    heightUsed += nextContest.height;
  }

  const currentPageElement =
    pageContests.length > 0 ? (
      <div>{pageContests}</div>
    ) : (
      <div>This page left intentionally blank</div>
    );
  const nextPageProps =
    measuredContests.length > 0
      ? {
          election: {
            ...election,
            contests: election.contests.slice(pageContests.length),
          },
        }
      : undefined;

  return {
    currentPageElement,
    nextPageProps,
  };
}

export const ballotPageTemplate: BallotPageTemplate<{
  election: MiniElection;
}> = {
  frameComponent: BallotPageFrame,
  contentComponent: BallotPageContent,
};
