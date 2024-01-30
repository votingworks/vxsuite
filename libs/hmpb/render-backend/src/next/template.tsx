import { assertDefined, iter, range } from '@votingworks/basics';
import React from 'react';
import styled from 'styled-components';
import {
  BallotPageTemplate,
  PagedElementResult,
  qrCodeSlot,
} from './render_ballot';
import { InchDimensions, PixelDimensions, RenderDocument } from './renderer';

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

const contentAreaDimensions: InchDimensions = {
  width: pageDimensions.width - pageMargins.left - pageMargins.right,
  height: pageDimensions.height - pageMargins.top - pageMargins.bottom,
};

const BallotPage = styled.div`
  height: ${contentAreaDimensions.height}in;
  width: ${contentAreaDimensions.width}in;
  break-after: page;
  overflow: hidden;
`;

const ppi = 96;
const markWidth = 0.1875 * ppi;
const markHeight = 0.0625 * ppi;

function TimingMark() {
  return (
    <div
      data-type="TimingMark"
      style={{
        width: `${markWidth}px`,
        height: `${markHeight}px`,
        backgroundColor: 'black',
      }}
    />
  );
}

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
        top: `-${markHeight}px`,
        height: `calc(100% + ${2 * markHeight}px)`,
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
      <div>{qrCodeSlot}</div>
    </div>
  );
}

const ContestBox = styled.div`
  background-color: #eee;
  border: 1px solid black;
  padding: 1rem;
`;

const Bubble = styled.div`
  display: inline-block;
  width: 15px;
  height: 8px;
  border-radius: 8px;
  border: 1px solid black;
`;

function Contest({ contest }: { contest: MiniElection['contests'][0] }) {
  return (
    <ContestBox className="contest" data-title={contest.title}>
      <div>{contest.title}</div>
      <ul style={{ listStyleType: 'none' }}>
        {contest.candidates.map((candidate) => (
          <li key={candidate}>
            <Bubble
              data-type="Bubble"
              data-contest={contest.title}
              data-candidate={candidate}
            />{' '}
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
    <BallotPage key={pageNumber} data-page={pageNumber}>
      <TimingMarkGrid>
        {pageNumber % 2 === 1 && <Header>{election.title}</Header>}
        <div style={{ flex: 1 }}>{children}</div>
        <Footer>
          Page: {pageNumber}/{totalPages}
        </Footer>
      </TimingMarkGrid>
    </BallotPage>
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
  document: RenderDocument
): Promise<PagedElementResult<{ election: MiniElection }>> {
  const contestElements = election.contests.map((contest) => (
    <Contest key={contest.title} contest={contest} />
  ));

  // Measure the contest boxes. This overwrites the current content of the document!
  // We're basically using the document as a measuring scratchpad during this
  // layout phase of the rendering.
  await document.setContent(
    'body',
    <>
      {contestElements.map((contest, i) => (
        <div key={i} style={{ width: dimensions.width }}>
          {contest}
        </div>
      ))}
    </>
  );
  const contestMeasurements = await document.inspectElements('body > div');
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
