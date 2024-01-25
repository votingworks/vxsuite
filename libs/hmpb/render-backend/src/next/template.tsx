import { assertDefined, range } from '@votingworks/basics';
import { writeFile } from 'fs/promises';
import { Browser, BrowserContext, Page, chromium } from 'playwright';
import React, { CSSProperties } from 'react';
import ReactDom from 'react-dom/server';

interface MiniElection {
  title: string;
  contests: Array<{
    title: string;
    candidates: string[];
  }>;
}

interface PixelDimensions {
  width: number;
  height: number;
}

const contentSlot = <div id="content-slot" style={{ height: '100%' }} />;

type FrameComponent<P> = (
  props: P & {
    pageNumber: number;
    totalPages: number;
    children: JSX.Element;
  }
) => JSX.Element;

interface PagedElementResult<P> {
  currentPageElement: JSX.Element;
  nextPageProps?: P;
}

type ContentComponent<P> = (
  props: P & { dimensions: PixelDimensions }
) => Promise<PagedElementResult<P>>;

interface PageTemplate<P> {
  frameComponent: FrameComponent<P>;
  contentComponent: ContentComponent<P>;
}

const boxStyle: CSSProperties = {
  padding: '2rem',
  border: '1px solid black',
};

let browserSingleton: Browser;
let contextSingleton: BrowserContext;
let pageSingleton: Page;

async function browserPage() {
  if (browserSingleton && contextSingleton && pageSingleton) {
    return {
      browser: browserSingleton,
      context: contextSingleton,
      page: pageSingleton,
    };
  }
  browserSingleton = await chromium.launch({
    args: ['--font-render-hinting=none'],
  });
  contextSingleton = await browserSingleton.newContext();
  pageSingleton = await contextSingleton.newPage();
  return browserPage();
}

async function cleanupBrowserContext() {
  if (browserSingleton && contextSingleton) {
    await contextSingleton.close();
    await browserSingleton.close();
  }
}

async function measureElements(
  elements: JSX.Element[]
): Promise<PixelDimensions[]> {
  const documentHtml = ReactDom.renderToStaticMarkup(
    <html>
      <body>{elements}</body>
    </html>
  );
  const { page } = await browserPage();
  await page.setContent(`<!DOCTYPE html>${documentHtml}`);
  const nodes = await page.locator('body > *').all();
  const dimensions = await Promise.all(
    nodes.map(async (node) => assertDefined(await node.boundingBox()))
  );
  return dimensions;
}

async function measureElementById(
  element: JSX.Element,
  id: string
): Promise<PixelDimensions> {
  const documentHtml = ReactDom.renderToStaticMarkup(
    <html>
      <body>{element}</body>
    </html>
  );
  const { page } = await browserPage();
  await page.setContent(`<!DOCTYPE html>${documentHtml}`);
  const node = page.locator(`#${id}`).first();
  const dimensions = assertDefined(await node.boundingBox());
  return dimensions;
}

function DocumentPage({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        height: '11in',
        width: '8.5in',
        breakAfter: 'page',
        overflow: 'hidden',
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

async function PagedContent({
  children,
  dimensions,
}: {
  children: JSX.Element[];
  dimensions: PixelDimensions;
}): Promise<PagedElementResult<{ children: JSX.Element[] }>> {
  const measurements = await measureElements(
    children.map((child, i) => (
      <div key={i} style={{ width: dimensions.width }}>
        {child}
      </div>
    ))
  );
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

function Contest({ contest }: { contest: MiniElection['contests'][0] }) {
  return (
    <div style={boxStyle}>
      <div>{contest.title}</div>
      <ul>
        {contest.candidates.map((candidate) => (
          <li key={candidate}>{candidate}</li>
        ))}
      </ul>
    </div>
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
    <DocumentPage key={pageNumber}>
      {pageNumber % 2 === 1 && <Header>{election.title}</Header>}
      <div style={{ flex: 1 }}>{children}</div>
      <Footer>
        Page: {pageNumber}/{totalPages}
      </Footer>
    </DocumentPage>
  );
}

async function BallotPageContent({
  election,
  dimensions,
}: {
  election: MiniElection;
  dimensions: PixelDimensions;
}): Promise<PagedElementResult<{ election: MiniElection }>> {
  const contestElements = election.contests.map((contest) => (
    <Contest key={contest.title} contest={contest} />
  ));
  const pagedContentResult = await PagedContent({
    children: contestElements,
    dimensions,
  });
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

const ballotPageTemplate: PageTemplate<{ election: MiniElection }> = {
  frameComponent: BallotPageFrame,
  contentComponent: BallotPageContent,
};

async function paginateDocumentContent<P extends Record<string, unknown>>(
  pageTemplate: PageTemplate<P>,
  props: P
): Promise<JSX.Element[]> {
  const pagedContentResults: Array<PagedElementResult<P>> = [];

  const { frameComponent, contentComponent } = pageTemplate;
  do {
    const pageFrame = frameComponent({
      // eslint-disable-next-line vx/gts-spread-like-types
      ...props,
      pageNumber: pagedContentResults.length + 1,
      totalPages: 0,
      children: contentSlot,
    });
    const contentSlotDimensions = await measureElementById(
      pageFrame,
      contentSlot.props.id
    );
    const currentPageProps: P =
      pagedContentResults[pagedContentResults.length - 1]?.nextPageProps ??
      props;
    const pagedContentResult = await contentComponent({
      // eslint-disable-next-line vx/gts-spread-like-types
      ...currentPageProps,
      dimensions: contentSlotDimensions,
    });
    pagedContentResults.push(pagedContentResult);
  } while (pagedContentResults[pagedContentResults.length - 1].nextPageProps);

  return pagedContentResults.map((pagedContentResult, i) =>
    frameComponent({
      // eslint-disable-next-line vx/gts-spread-like-types
      ...props,
      pageNumber: i + 1,
      totalPages: pagedContentResults.length,
      children: pagedContentResult.currentPageElement,
    })
  );
}

async function renderBallot(election: MiniElection) {
  const ballotPages = await paginateDocumentContent(ballotPageTemplate, {
    election,
  });
  const documentHtml = ReactDom.renderToStaticMarkup(
    <html>
      <body>{ballotPages}</body>
    </html>
  );
  const { context } = await browserPage();
  const page = await context.newPage();

  await page.setContent(`<!DOCTYPE html>${documentHtml}`);
  const pdfBuffer = await page.pdf({
    format: 'letter',
    margin: {
      top: '0.25in',
      right: '0.25in',
      bottom: '0.25in',
      left: '0.25in',
    },
    printBackground: true,
  });

  return pdfBuffer;
}

async function main() {
  const election: MiniElection = {
    title: 'Mini Election',
    contests: range(0, 10).map((i) => ({
      title: `Contest ${i + 1}`,
      candidates: range(0, 5).map((j) => `Candidate ${i + 1}-${j + 1}`),
    })),
  };
  await browserPage();
  const t1 = Date.now();
  const ballotPdf = await renderBallot(election);
  const t2 = Date.now();
  await cleanupBrowserContext();
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

// interface PaginatedComponentProps {
//   pageIndex: number; // How many times this content has been wrapped to a new page so far
//   container: { width: number; height: number };
//   children: JSX.Element[];
// }

// type PaginatedComponent = (props: PaginatedComponentProps) => {
//   currentPageElement: JSX.Element | null;
//   nextPageProps: PaginatedComponentProps | null;
// };

// Pagination
/* <ContestSection>
  <Contest>...</Contest>
  <Contest>...</Contest>
</ContestSection>
 -> 
 {
  type: 'ContestSection',
  children: [<Contest/>, <Contest/>],
 }
 ->  
 */

// Example paginated components:
// - Single column full-width flow
// - Multi-column layout with fixed number of columns (e.g. 3-column)
// - Multi-column layout that tries different numbers of columns
