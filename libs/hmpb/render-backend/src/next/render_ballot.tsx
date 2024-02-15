import { Buffer } from 'buffer';
import { assertDefined } from '@votingworks/basics';
import {
  PdfOptions,
  createRenderer,
  RenderDocument,
  RenderScratchpad,
} from './renderer';
import {
  BUBBLE_CLASS,
  CONTENT_SLOT_CLASS,
  ContentSlot,
  PAGE_CLASS,
  QR_CODE_SLOT_CLASS,
  TIMING_MARK_CLASS,
} from './ballot_components';
import { PixelDimensions } from './types';

export type FrameComponent<P> = (
  props: P & { children: JSX.Element; pageNumber: number; totalPages: number }
) => JSX.Element;

export interface PagedElementResult<P> {
  currentPageElement: JSX.Element;
  nextPageProps?: P;
}

export type ContentComponent<P> = (
  props: P & { dimensions: PixelDimensions },
  // The content component is passed the scratchpad so that it can measure
  // elements in order to determine how much content fits on each page.
  scratchpad: RenderScratchpad
) => Promise<PagedElementResult<P>>;

/**
 * A page template consists of two interlocking pieces:
 * - A frame component (imagine it like a picture frame) that is rendered on each page
 * - A content component that knows how to render a page at a time of content
 * within the frame. Given a set of props (e.g. list of contests) the content component returns two items:
 *     - The content element for the current page (e.g. the contest boxes for this page)
 *     - The props for the next page (e.g. the contests that didn't fit on this page)
 */
export interface BallotPageTemplate<P> {
  frameComponent: FrameComponent<P>;
  contentComponent: ContentComponent<P>;
}

/**
 * To paginate ballot content, we go through the following steps:
 *
 * Render the content for each page:
 * - Render the frame on the first page
 * - Measure how much space is available inside the frame for content
 * - Render the content for this page (given the available space) and save it
 * - If we still have content left to render, repeat with the next page
 *
 * Once we have the content for each page, we render the content into the frame
 * for each page, passing in the page number and total number of pages.
 */
async function paginateBallotContent<P extends Record<string, unknown>>(
  pageTemplate: BallotPageTemplate<P>,
  props: P,
  scratchpad: RenderScratchpad
): Promise<JSX.Element[]> {
  const pagedContentResults: Array<PagedElementResult<P>> = [];

  const { frameComponent, contentComponent } = pageTemplate;
  do {
    const pageFrame = frameComponent({
      // eslint-disable-next-line vx/gts-spread-like-types
      ...props,
      pageNumber: pagedContentResults.length + 1,
      totalPages: 0,
      children: <ContentSlot />,
    });
    const [contentSlotElement] = await scratchpad.measureElements(
      pageFrame,
      `.${CONTENT_SLOT_CLASS}`
    );
    const currentPageProps: P =
      pagedContentResults[pagedContentResults.length - 1]?.nextPageProps ??
      props;
    const pagedContentResult = await contentComponent(
      {
        // eslint-disable-next-line vx/gts-spread-like-types
        ...currentPageProps,
        dimensions: {
          width: contentSlotElement.width,
          height: contentSlotElement.height,
        },
      },
      scratchpad
    );
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

interface ContestOptionLayout {
  contest: string;
  candidate: string;
  column: number;
  row: number;
}

/**
 * We rely on data-* attributes to locate and identify timing marks and contest
 * option bubbles within the DOM after the ballot has been rendered. This allows
 * the template to focus on rendering declaratively without worry about absolute
 * positions. We'll probably want to have some layer of abstraction for
 * templates to use to ensure they get the data-* attributes right.
 */
async function extractLayoutInfo(
  document: RenderDocument
): Promise<ContestOptionLayout[]> {
  const pages = await document.inspectElements(`.${PAGE_CLASS}`);
  const optionLayoutsPerPage = await Promise.all(
    pages.map(async (_, i) => {
      const pageNumber = i + 1;
      const timingMarkElements = await document.inspectElements(
        `.${PAGE_CLASS}[data-page-number="${pageNumber}"] .${TIMING_MARK_CLASS}`
      );

      const minX = Math.min(...timingMarkElements.map((mark) => mark.x));
      const minY = Math.min(...timingMarkElements.map((mark) => mark.y));
      const maxX = Math.max(...timingMarkElements.map((mark) => mark.x));
      const maxY = Math.max(...timingMarkElements.map((mark) => mark.y));
      const gridWidth = maxX - minX;
      const gridHeight = maxY - minY;
      const originX = minX + timingMarkElements[0].width / 2;
      const originY = minY + timingMarkElements[0].height / 2;
      // There are two overlayed timing marks in each corner, don't double count them
      const numRows =
        timingMarkElements.filter((mark) => mark.x === minX).length - 2;
      const numColumns =
        timingMarkElements.filter((mark) => mark.y === minY).length - 2;
      const columnWidth = gridWidth / numColumns;
      const rowHeight = gridHeight / numRows;

      function pixelPointToGridPoint(
        x: number,
        y: number
      ): { column: number; row: number } {
        return {
          column: (x - originX) / columnWidth,
          row: (y - originY) / rowHeight,
        };
      }

      const bubbles = await document.inspectElements(
        `.${PAGE_CLASS}[data-page-number="${pageNumber}"] .${BUBBLE_CLASS}`
      );
      const optionLayouts = bubbles.map((bubble) => ({
        contest: assertDefined(bubble.data.contestId),
        candidate: assertDefined(bubble.data.optionId),
        ...pixelPointToGridPoint(bubble.x, bubble.y),
      }));
      return optionLayouts;
    })
  );

  return optionLayoutsPerPage.flat();
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function electionHashFromLayoutInfo(layoutInfo: ContestOptionLayout[]): string {
  return 'fake-election-hash'; // Not important for this proof of concept
}

/**
 * To add QR codes, we could do it the way we did it previously, restarting the
 * whole rendering process with an electionHash prop passed in. However, since
 * we've already broken the seal on mutation, why not just swap in the QR code
 * element directly?
 */
async function addQrCodes(document: RenderDocument, electionHash: string) {
  const pages = await document.inspectElements(`.${PAGE_CLASS}`);
  for (const i of pages.keys()) {
    const pageNumber = i + 1;
    const qrCode = (
      <div style={{ border: '1px solid green' }}>
        QR code
        <br />
        {electionHash}
        <br />
        {pageNumber}
      </div>
    );
    await document.setContent(
      `.${PAGE_CLASS}[data-page-number="${pageNumber}"] .${QR_CODE_SLOT_CLASS}`,
      qrCode
    );
  }
}

/**
 * Given a ballot page template, which specifies the layout for an individual
 * ballot page, and props (i.e. the election content), render a ballot PDF.
 */
export async function renderBallotToPdf<P extends Record<string, unknown>>(
  template: BallotPageTemplate<P>,
  props: P,
  options: PdfOptions
): Promise<Buffer> {
  const renderer = await createRenderer();
  const t1 = Date.now();
  const [scratchpad, document] = await Promise.all([
    renderer.createScratchpad(),
    renderer.createDocument(),
  ]);
  const pages = await paginateBallotContent(template, props, scratchpad);
  await document.setContent('body', <>{pages}</>);
  const layoutInfo = await extractLayoutInfo(document);
  // Normally we'd need to have layout info from all ballots to compute the
  // election hash - we're simplifying here
  const electionHash = electionHashFromLayoutInfo(layoutInfo);
  await addQrCodes(document, electionHash);
  const pdf = await document.renderToPdf(options);
  const t2 = Date.now();
  // eslint-disable-next-line no-console
  console.log(`Rendered document in ${t2 - t1}ms`);
  await Promise.all([scratchpad.dispose(), document.dispose()]);
  await renderer.cleanup();
  return pdf;
}
