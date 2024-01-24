import { assert, assertDefined, range } from '@votingworks/basics';
import { writeFile } from 'fs/promises';
import { chromium } from 'playwright';
import React, { CSSProperties } from 'react';
import ReactDom from 'react-dom/server';

const boxStyle: CSSProperties = {
  padding: '2rem',
  border: '1px solid black',
};

interface MiniElection {
  title: string;
  contests: Array<{
    title: string;
    candidates: string[];
  }>;
}

function measureElement(element: JSX.Element, id?: string): PixelDimensions {
  if (id) {
    return {
      width: 100,
      height: 400,
    };
  }
  return {
    width: 100,
    height: 200,
  };
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

function PagedContent({
  children,
  dimensions,
}: {
  children: React.ReactNode;
  dimensions?: PixelDimensions;
}): PagedElement | null {
  if (!dimensions) {
    return (
      <div id="paged-content" style={{ flexGrow: 1 }}>
        {children}
      </div>
    );
  }

  const measuredChildren = React.Children.toArray(children).map((child) => ({
    child,
    ...measureElement(<div style={{ width: dimensions.width }}>{child}</div>),
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

  // If we can fit all of our children on this page, return one element
  // If we can fit some of our children on this page, return one element with nextPageProps
  // If we can't fit any of our children on this page, return null

  const pageElement =
    pageChildren.length > 0 ? (
      <div id="paged-content" style={{ flexGrow: 1 }}>
        {pageChildren}
      </div>
    ) : null;
  const nextPageChildren =
    measuredChildren.length > 0
      ? measuredChildren.map(({ child }) => child)
      : null;

  return (
    pageElement && {
      ...pageElement,
      nextPageChildren,
    }
  );
}

interface PixelDimensions {
  width: number;
  height: number;
}

interface PagedElement extends JSX.Element {
  nextPageChildren?: React.ReactNode;
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

function BallotPageTemplate({
  election,
  pageNumber,
  totalPages,
}: {
  election: MiniElection;
  pageNumber: number;
  totalPages: number;
}) {
  return (
    <DocumentPage>
      <Header>{election.title}</Header>
      <PagedContent>
        {election.contests.map((contest) => (
          <Contest key={contest.title} contest={contest} />
        ))}
      </PagedContent>
      <Footer>
        Page: {pageNumber}/{totalPages}
      </Footer>
    </DocumentPage>
  );
}

function mapElement(
  element: JSX.Element,
  fn: (element: JSX.Element) => JSX.Element
): JSX.Element {
  const mappedElement = fn(element);
  const children =
    'children' in mappedElement.props
      ? React.Children.map(mappedElement.props.children, (child) => {
          if (typeof child === 'string' || !React.isValidElement(child)) {
            return child;
          }
          return mapElement(child, fn);
        })
      : undefined;
  if (typeof mappedElement.type === 'string') {
    return mappedElement;
  }
  const expandedElement = mappedElement.type({
    ...mappedElement.props,
    children,
  });
  return mapElement(expandedElement, fn);
}

function findElement(
  element: JSX.Element,
  fn: (element: JSX.Element) => boolean
): JSX.Element | null {
  if (fn(element)) {
    return element;
  }
  if ('children' in element.props) {
    const foundChild = React.Children.toArray(element.props.children).find(
      (child) => React.isValidElement(child) && fn(child)
    );
    if (foundChild) {
      return foundChild as JSX.Element;
    }
  }
  const expandedElement = element.type(element.props);
  return findElement(expandedElement, fn);
}

function paginateBallot(ballotTemplate: JSX.Element): JSX.Element[] {
  const pagedContentForPages: JSX.Element[] = [];
  let nextPagedContentChildren: React.ReactNode;
  do {
    const pageWithNoPagedContent = mapElement(ballotTemplate, (element) => {
      if (element.type === PagedContent) {
        return React.cloneElement(element, element.props, []);
      }
      return element;
    });
    const pagedContentDimensions = measureElement(
      pageWithNoPagedContent,
      'paged-content'
    );
    const pagedContentElement = findElement(
      ballotTemplate,
      (element) => element.type === PagedContent
    );
    assert(pagedContentElement);
    const { nextPageChildren, ...pagedContentElementForThisPage } =
      pagedContentElement.type({
        ...pagedContentElement.props,
        children:
          nextPagedContentChildren ?? pagedContentElement.props.children,
        dimensions: pagedContentDimensions,
      });
    console.log({
      nextPageChildren,
      pagedContentElementForThisPage,
    });

    nextPagedContentChildren = nextPageChildren;
    pagedContentForPages.push(pagedContentElementForThisPage);
  } while (nextPagedContentChildren);

  console.log(pagedContentForPages);
  return pagedContentForPages.map((pagedContent, i) => {
    const ballotPage = React.cloneElement(ballotTemplate, {
      ...ballotTemplate.props,
      key: i,
      pageNumber: i + 1,
      totalPages: pagedContentForPages.length,
    });
    return mapElement(ballotPage, (element) => {
      if (element.type === PagedContent) {
        return pagedContent;
      }
      return element;
    });
  });
}

async function renderBallot(election: MiniElection) {
  const ballotTemplate = (
    <BallotPageTemplate election={election} pageNumber={0} totalPages={0} />
  );
  const ballotPages = paginateBallot(ballotTemplate);
  const documentHtml = ReactDom.renderToStaticMarkup(
    <html>
      <head></head>
      <body>{ballotPages}</body>
    </html>
  );
  const browser = await chromium.launch({
    args: ['--font-render-hinting=none'],
  });
  const context = await browser.newContext();
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

  await context.close();
  await browser.close();

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
  const ballotPdf = await renderBallot(election);
  const outputPath = 'ballot.pdf';
  await writeFile(outputPath, ballotPdf);
  console.log(`Rendered ballot to ${outputPath}`);
}

main().catch((err) => {
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
