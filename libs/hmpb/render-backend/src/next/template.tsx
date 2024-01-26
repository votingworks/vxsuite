import { Buffer } from 'buffer';
import { assertDefined, range } from '@votingworks/basics';
import { writeFile } from 'fs/promises';
import React, { CSSProperties } from 'react';
import styled from 'styled-components';
import {
  BallotPageTemplate,
  PagedElementResult,
  renderBallotToPdf,
} from './render_ballot';
import { InchDimensions, PixelDimensions, RenderDocument } from './renderer';

const boxStyle: CSSProperties = {
  padding: '2rem',
  border: '1px solid black',
};

export interface MiniElection {
  title: string;
  contests: Array<{
    title: string;
    candidates: string[];
  }>;
}

const pageDimensions: InchDimensions = {
  width: 8.5,
  height: 11,
};

const pageMargins = {
  top: 0.25,
  right: 0.25,
  bottom: 0.25,
  left: 0.25,
} as const;

function BallotPage({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        // lineHeight: 1.2,
        height: `${
          pageDimensions.height - pageMargins.top - pageMargins.bottom
        }in`,
        width: `${
          pageDimensions.width - pageMargins.left - pageMargins.right
        }in`,
        breakAfter: 'page',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
        }}
      >
        {children}
      </div>
    </div>
  );
}

function Header({ children }: { children: React.ReactNode }) {
  return <div style={boxStyle}>{children}</div>;
}

async function PagedContent(
  {
    children,
    dimensions,
  }: {
    children: JSX.Element[];
    dimensions: PixelDimensions;
  },
  document: RenderDocument
): Promise<PagedElementResult<{ children: JSX.Element[] }>> {
  await document.setBodyContent(
    <>
      {children.map((child, i) => (
        <div key={i} style={{ width: dimensions.width }}>
          {child}
        </div>
      ))}
    </>
  );
  const measurements = await document.measureElements('body > div');
  const measuredChildren = children.map((child, i) => ({
    child,
    ...measurements[i],
  }));

  const pageChildren: React.ReactNode[] = [];
  let heightUsed = 0;
  while (measuredChildren.length > 0) {
    const nextChildHeight = measuredChildren[0].height;
    if (heightUsed + nextChildHeight > dimensions.height) {
      break;
    }
    const nextChild = assertDefined(measuredChildren.shift());
    pageChildren.push(nextChild.child);
    heightUsed += nextChild.height;
  }

  const currentPageElement =
    pageChildren.length > 0 ? (
      <div>{pageChildren}</div>
    ) : (
      <div>This page left intentionally blank</div>
    );
  const nextPageProps =
    measuredChildren.length > 0
      ? { children: measuredChildren.map(({ child }) => child) }
      : undefined;

  return {
    currentPageElement,
    nextPageProps,
  };
}

function Footer({ children }: { children: React.ReactNode }) {
  return <div style={boxStyle}>{children}</div>;
}

const ContestBox = styled.div`
  background-color: #eee;
  border: 1px solid black;
  padding: 1rem;
`;

function Contest({ contest }: { contest: MiniElection['contests'][0] }) {
  return (
    <ContestBox className="contest" data-title={contest.title}>
      <div>{contest.title}</div>
      <ul>
        {contest.candidates.map((candidate) => (
          <li key={candidate}>{candidate}</li>
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
}) {
  return (
    <BallotPage key={pageNumber}>
      {pageNumber % 2 === 1 && <Header>{election.title}</Header>}
      <div style={{ flex: 1 }}>{children}</div>
      <Footer>
        Page: {pageNumber}/{totalPages}
      </Footer>
    </BallotPage>
  );
}

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
  const pagedContentResult = await PagedContent(
    {
      children: contestElements,
      dimensions,
    },
    document
  );
  return {
    ...pagedContentResult,
    nextPageProps: pagedContentResult.nextPageProps && {
      election: {
        ...election,
        contests: pagedContentResult.nextPageProps.children.map(
          (child) => child.props.contest as MiniElection['contests'][0]
        ),
      },
    },
  };
}

const ballotPageTemplate: BallotPageTemplate<{ election: MiniElection }> = {
  frameComponent: BallotPageFrame,
  contentComponent: BallotPageContent,
};

function renderBallot(election: MiniElection): Promise<Buffer> {
  return renderBallotToPdf(
    ballotPageTemplate,
    { election },
    { pageDimensions, pageMargins }
  );
}

async function main() {
  const election: MiniElection = {
    title: 'Mini Election',
    contests: range(0, 10).map((i) => ({
      title: `Contest ${i + 1}`,
      candidates: range(0, 5).map((j) => `Candidate ${i + 1}-${j + 1}`),
    })),
  };
  const t1 = Date.now();
  const ballotPdf = await renderBallot(election);
  const t2 = Date.now();
  const outputPath = 'ballot.pdf';
  await writeFile(outputPath, ballotPdf);
  // eslint-disable-next-line no-console
  console.log(`Rendered ballot to ${outputPath} in ${t2 - t1}ms`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});

// A contest section tries to fit as many contests as it can into the height
// left in the page, while also minimizing the height used

// Components inside PagedContent are passed a "heightRemaining" prop, and can decide how much height they want to use accordingly
// When rendering, we render everything outside of PagedContent first in order to know how much height is left

// How does the child of PagedContent know what content was rendered on the previous page? Where did we leave off?
// You have to fully render a contest (with a fixed width) in order to measure its height (due to rich text, images, etc)

// A ballot template is a React component
// We have a React custom renderer that uses the following approach:
// - Generally, dispatches to ReactDOM to render a given node
// - Has some special handling around pagination
// - Exposes a primitive to render and measure an element that can be used by a parent to measure its child

// - Render the content around the PaginatedSection on page 1 with ReactDOM
// - Render the PaginatedSection for page 1, passing in its container dimensions
// - For each PaginatedComponent child:
//   - Render the PaginatedComponent with pageIndex 0, full container dimensions
//      - If it returns nextProps, start a new page, modifying the PaginatedSection children queue to include the next props
//      - If returns null nextProps, move to next PaginatedComponent with container dimensions reduced by height of last rendered component
// PaginatedComponent must be able to measure the dimensions of a child
// component (i.e. render it) while it does its layout

// How do we implement snapping to a vertical grid?
// Easy enough using the measuring API

// How do we extract grid layouts?
// Annotate the rendered elements with data-* attributes to encode candidate IDs and grid positions, then traverse
// the DOM to extract the layout

// How do we add in a QR code
// After extracting the grid layouts, we can simply mutate the placeholder in the DOM (or rerender the whole thing)
