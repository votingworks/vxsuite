import {
  type Result,
  assert,
  assertDefined,
  deepEqual,
  ok,
} from '@votingworks/basics';
import type { Contest } from '@votingworks/types';
import type { BaseStylesProps } from './base_styles.js';
import type { Renderer, RenderDocument, RenderScratchpad } from './renderer.js';
import {
  ContentSlot,
  CONTENT_SLOT_CLASS,
  PAGE_CLASS,
  TIMING_MARK_CLASS,
} from './ballot_components.js';
import type { PixelDimensions, Pixels, Point } from './types.js';

export type StylesComponent<P> = (props: P) => JSX.Element;

export type FrameComponent<P> = (
  props: P & { children: JSX.Element; pageNumber: number; totalPages?: number }
) => Result<JSX.Element, BallotLayoutError>;

export interface PaginatedContent {
  currentPageElement: JSX.Element;
  leftoverContests: readonly Contest[];
}

interface ContestTooLongError {
  error: 'contestTooLong';
  contest: Contest;
}

interface MissingSignatureError {
  error: 'missingSignature';
}

export type BallotLayoutError = ContestTooLongError | MissingSignatureError;

export type ContentComponentResult = Result<
  PaginatedContent | undefined,
  BallotLayoutError
>;

export type ContentComponent<P> = (
  props: P & { dimensions: PixelDimensions },
  contests: readonly Contest[],
  // The content component is passed the scratchpad so that it can measure
  // elements in order to determine how much content fits on each page.
  scratchpad: RenderScratchpad
) => Promise<ContentComponentResult>;

/**
 * A page template consists of interlocking pieces:
 * - A styles component that defines the root styles to add to the page's head (e.g. fonts, sizes)
 * - A frame component (imagine it like a picture frame) that is rendered on each page
 * - A function that determines which contests should be laid out for a given
 * ballot (e.g. filtering by ballot style)
 * - A content component that knows how to render a page of contests within the frame.
 * Given the ballot props and the contests left to lay out, it returns two items:
 *     - The content element for the current page (e.g. the contest boxes for this page)
 *     - The contests that didn't fit on this page
 */
export interface BallotPageTemplate<P extends object> {
  stylesComponent: StylesComponent<P>;
  frameComponent: FrameComponent<P>;
  contestsForBallot: (props: P) => readonly Contest[];
  contentComponent: ContentComponent<P>;
  isAllBubbleBallot?: boolean;
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
export async function paginateBallotContent<P extends object>(
  pageTemplate: BallotPageTemplate<P>,
  props: P,
  scratchpad: RenderScratchpad
): Promise<Result<JSX.Element[], BallotLayoutError>> {
  const { frameComponent, contentComponent } = pageTemplate;
  async function layOutPage(
    pageProps: P & { pageNumber: number; totalPages?: number },
    contests: readonly Contest[]
  ) {
    const pageFrameResult = frameComponent({
      ...pageProps,
      children: <ContentSlot />,
    });
    // @coverage-defer
    if (pageFrameResult.isErr()) {
      return pageFrameResult;
    }
    const pageFrame = pageFrameResult.ok();

    const [contentSlotMeasurements] = await scratchpad.measureElements(
      pageFrame,
      `.${CONTENT_SLOT_CLASS}`
    );
    const dimensions: PixelDimensions = {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      width: contentSlotMeasurements!.width,
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      height: contentSlotMeasurements!.height,
    };

    return contentComponent({ ...pageProps, dimensions }, contests, scratchpad);
  }

  const pages: PaginatedContent[] = [];
  let contestsToPaginate = pageTemplate.contestsForBallot(props);
  assert(contestsToPaginate.length > 0, 'No contests assigned to this ballot');

  do {
    const pageResult = await layOutPage(
      {
        // eslint-disable-next-line vx/gts-spread-like-types
        ...props,
        pageNumber: pages.length + 1,
        totalPages: 0,
      },
      contestsToPaginate
    );
    if (pageResult.isErr()) {
      return pageResult;
    }
    const page = assertDefined(pageResult.ok());
    // If the leftover contests are the same as the given contests, we're in an
    // infinite loop.  This can happen if the content is too tall to fit on a
    // page. We expect the contentComponent to handle this case and throw a
    // meaningful error that points out which contest is too tall, so this is
    // just a backup safeguard.
    assert(
      !deepEqual(page.leftoverContests, contestsToPaginate),
      'Contest is too tall to fit on page'
    );
    pages.push(page);
    contestsToPaginate = page.leftoverContests;
  } while (contestsToPaginate.length > 0);

  // Frame pages first so the page numbering and footer voting progress
  // instructions reflect only pages with content.
  const framedPages: JSX.Element[] = [];
  for (let i = 0; i < pages.length; i += 1) {
    const frameResult = frameComponent({
      // eslint-disable-next-line vx/gts-spread-like-types
      ...props,
      pageNumber: i + 1,
      totalPages: pages.length,
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      children: pages[i]!.currentPageElement,
    });
    // @coverage-defer
    if (frameResult.isErr()) {
      return frameResult;
    }
    framedPages.push(frameResult.ok());
  }

  // Then add a blank page if the number of pages is odd.
  if (pages.length % 2 === 1) {
    const blankPageResult = await layOutPage(
      // eslint-disable-next-line vx/gts-spread-like-types
      { ...props, pageNumber: pages.length + 1 },
      []
    );
    // @coverage-defer
    if (blankPageResult.isErr()) {
      return blankPageResult;
    }
    const blankPage = blankPageResult.ok();
    if (blankPage) {
      const lastFrameResult = frameComponent({
        // eslint-disable-next-line vx/gts-spread-like-types
        ...props,
        pageNumber: pages.length + 1,
        children: blankPage.currentPageElement,
      });
      // @coverage-defer
      if (lastFrameResult.isErr()) {
        return lastFrameResult;
      }
      framedPages.push(lastFrameResult.ok());
    }
  }

  return ok(framedPages);
}

export function gridWidthToPixels(
  grid: GridMeasurements,
  width: number
): number {
  return width * grid.columnGap;
}

export function gridHeightToPixels(
  grid: GridMeasurements,
  height: number
): number {
  return height * grid.rowGap;
}

export interface GridMeasurements {
  origin: Point<Pixels>;
  columnGap: Pixels;
  rowGap: Pixels;
  numTimingMarkColumns: number;
  numTimingMarkRows: number;
}

export async function measureTimingMarkGrid(
  document: RenderDocument,
  pageNumber: number
): Promise<GridMeasurements> {
  const timingMarkElements = await document.inspectElements(
    `.${PAGE_CLASS}[data-page-number="${pageNumber}"] .${TIMING_MARK_CLASS}`
  );

  const minX = Math.min(...timingMarkElements.map((mark) => mark.x));
  const minY = Math.min(...timingMarkElements.map((mark) => mark.y));
  const maxX = Math.max(...timingMarkElements.map((mark) => mark.x));
  const maxY = Math.max(...timingMarkElements.map((mark) => mark.y));

  const gridWidth = maxX - minX;
  const gridHeight = maxY - minY;

  // The grid origin is the center of the top-left timing mark
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const originX = minX + timingMarkElements[0]!.width / 2;
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const originY = minY + timingMarkElements[0]!.height / 2;

  // There are two overlayed timing marks in each corner, don't double count them
  const numTimingMarkRows =
    timingMarkElements.filter((mark) => mark.x === minX).length - 2;
  const numTimingMarkColumns =
    timingMarkElements.filter((mark) => mark.y === minY).length - 2;

  const columnGap = gridWidth / (numTimingMarkColumns - 1);
  const rowGap = gridHeight / (numTimingMarkRows - 1);

  return {
    origin: { x: originX, y: originY },
    numTimingMarkColumns,
    numTimingMarkRows,
    columnGap,
    rowGap,
  };
}

/**
 * Given a {@link BallotPageTemplate} and a single set of props, renders the
 * pages of the ballot and returns the resulting {@link RenderDocument}.
 */
export async function renderBallotTemplate<P extends object>(
  renderer: Renderer,
  template: BallotPageTemplate<P>,
  props: P & BaseStylesProps
): Promise<Result<RenderDocument, BallotLayoutError>> {
  const scratchpad = await renderer.createScratchpad(
    template.stylesComponent(props)
  );
  const pages = await paginateBallotContent(template, props, scratchpad);
  if (pages.isErr()) {
    return pages;
  }
  const document = scratchpad.convertToDocument();
  await document.setContent('body', <>{pages.ok()}</>);
  return ok(document);
}
