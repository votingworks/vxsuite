import React from 'react';
import { Buffer } from 'node:buffer';
import {
  assert,
  assertDefined,
  deepEqual,
  find,
  groupBy,
  iter,
  ok,
  Result,
  throwIllegalValue,
  unique,
} from '@votingworks/basics';
import {
  AnyContest,
  BallotStyleId,
  BallotType,
  CandidateContest,
  CandidateId,
  Election,
  ElectionDefinition,
  ElectionSerializationFormat,
  GridLayout,
  GridPosition,
  GridPositionOption,
  HmpbBallotPageMetadata,
  Outset,
  PrecinctId,
  convertVxfElectionToCdfBallotDefinition,
  formatBallotHash,
  safeParseElection,
  safeParseElectionDefinition,
} from '@votingworks/types';
import { QrCode } from '@votingworks/ui';
import { encodeHmpbBallotPageMetadata } from '@votingworks/ballot-encoder';
import { tmpNameSync } from 'tmp';
import { readFile, rm, writeFile } from 'node:fs/promises';
import {
  DocumentElement,
  RenderDocument,
  RenderScratchpad,
  Renderer,
} from './renderer';
import {
  BUBBLE_CLASS,
  CONTENT_SLOT_CLASS,
  ContentSlot,
  BALLOT_HASH_SLOT_CLASS,
  CANDIDATE_OPTION_CLASS,
  OptionInfo,
  PAGE_CLASS,
  QR_CODE_SIZE,
  QR_CODE_SLOT_CLASS,
  TIMING_MARK_CLASS,
  WRITE_IN_OPTION_CLASS,
  BALLOT_MEASURE_OPTION_CLASS,
} from './ballot_components';
import {
  BALLOT_MODES,
  BallotMode,
  PixelDimensions,
  Pixels,
  Point,
} from './types';
import { BaseStylesProps } from './base_styles';

export type StylesComponent<P> = (props: P) => JSX.Element;

export type FrameComponent<P> = (
  props: P & { children: JSX.Element; pageNumber: number; totalPages?: number }
) => Result<JSX.Element, BallotLayoutError>;

export interface PaginatedContent<P> {
  currentPageElement: JSX.Element;
  nextPageProps?: P;
}

interface ContestTooLongError {
  error: 'contestTooLong';
  contest: AnyContest;
}

interface MissingSignatureError {
  error: 'missingSignature';
}

export type BallotLayoutError = ContestTooLongError | MissingSignatureError;

export type ContentComponentResult<P> = Result<
  PaginatedContent<P>,
  BallotLayoutError
>;

export type ContentComponent<P> = (
  props: (P & { dimensions: PixelDimensions }) | undefined,
  // The content component is passed the scratchpad so that it can measure
  // elements in order to determine how much content fits on each page.
  scratchpad: RenderScratchpad
) => Promise<ContentComponentResult<P>>;

/**
 * A page template consists of two interlocking pieces:
 * - A styles component that defines the root styles to add to the page's head (e.g. fonts, sizes)
 * - A frame component (imagine it like a picture frame) that is rendered on each page
 * - A content component that knows how to render a page at a time of content
 * within the frame. Given a set of props (e.g. list of contests) the content component returns two items:
 *     - The content element for the current page (e.g. the contest boxes for this page)
 *     - The props for the next page (e.g. the contests that didn't fit on this page)
 */
export interface BallotPageTemplate<P extends object> {
  stylesComponent: StylesComponent<P>;
  frameComponent: FrameComponent<P>;
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
async function paginateBallotContent<P extends object>(
  pageTemplate: BallotPageTemplate<P>,
  props: P,
  scratchpad: RenderScratchpad
): Promise<Result<JSX.Element[], BallotLayoutError>> {
  const pages: Array<PaginatedContent<P>> = [];

  const { frameComponent, contentComponent } = pageTemplate;
  do {
    const pageFrameResult = frameComponent({
      // eslint-disable-next-line vx/gts-spread-like-types
      ...props,
      pageNumber: pages.length + 1,
      totalPages: 0,
      children: <ContentSlot />,
    });
    if (pageFrameResult.isErr()) {
      return pageFrameResult;
    }
    const pageFrame = pageFrameResult.ok();

    const [contentSlotMeasurements] = await scratchpad.measureElements(
      pageFrame,
      `.${CONTENT_SLOT_CLASS}`
    );
    const currentPageProps: P = pages.at(-1)?.nextPageProps ?? props;

    // If the props are the same as the last page, we're in an infinite loop.
    // This can happen if the content is too tall to fit on a page. We expect
    // the contentComponent to handle this case and throw a meaningful error
    // that points out which contest is too tall, so this is just a backup
    // safeguard.
    assert(
      !deepEqual(currentPageProps, pages[pages.length - 2]?.nextPageProps),
      'Contest is too tall to fit on page'
    );

    const pageResult = await contentComponent(
      {
        // eslint-disable-next-line vx/gts-spread-like-types
        ...currentPageProps,
        dimensions: {
          width: contentSlotMeasurements.width,
          height: contentSlotMeasurements.height,
        },
      },
      scratchpad
    );
    if (pageResult.isErr()) {
      return pageResult;
    }
    pages.push(pageResult.ok());
  } while (pages.at(-1)?.nextPageProps);

  // Frame pages first so the page numbering and footer voting progress
  // instructions reflect only pages with content.
  const framedPages: JSX.Element[] = [];
  for (let i = 0; i < pages.length; i += 1) {
    const frameResult = frameComponent({
      // eslint-disable-next-line vx/gts-spread-like-types
      ...props,
      pageNumber: i + 1,
      totalPages: pages.length,
      children: pages[i].currentPageElement,
    });
    if (frameResult.isErr()) {
      return frameResult;
    }
    framedPages.push(frameResult.ok());
  }

  if (pages.length % 2 === 1) {
    const lastPageResult = await contentComponent(undefined, scratchpad);
    if (lastPageResult.isErr()) {
      return lastPageResult;
    }
    const page = lastPageResult.ok();
    const lastFrameResult = frameComponent({
      // eslint-disable-next-line vx/gts-spread-like-types
      ...props,
      pageNumber: pages.length + 1,
      children: page.currentPageElement,
    });
    if (lastFrameResult.isErr()) {
      return lastFrameResult;
    }
    framedPages.push(lastFrameResult.ok());
  }

  return ok(framedPages);
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
  const originX = minX + timingMarkElements[0].width / 2;
  const originY = minY + timingMarkElements[0].height / 2;

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

export function pixelsToGridHeight(
  grid: GridMeasurements,
  pixels: Pixels
): number {
  return pixels / grid.rowGap;
}

export function pixelsToGridWidth(
  grid: GridMeasurements,
  pixels: Pixels
): number {
  return pixels / grid.columnGap;
}

export function pixelPointToGridPoint(
  grid: GridMeasurements,
  point: Point<Pixels>
): { column: number; row: number } {
  return {
    column: pixelsToGridWidth(grid, point.x - grid.origin.x),
    row: pixelsToGridHeight(grid, point.y - grid.origin.y),
  };
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

async function extractGridLayout(
  document: RenderDocument,
  ballotStyleId: BallotStyleId,
  isAllBubbleBallot = false
): Promise<GridLayout> {
  const pages = await document.inspectElements(`.${PAGE_CLASS}`);
  const optionPositionsPerPage = await Promise.all(
    pages.map(async (_, i) => {
      const pageNumber = i + 1;
      const grid = await measureTimingMarkGrid(document, pageNumber);

      const bubbles = await document.inspectElements(
        `.${PAGE_CLASS}[data-page-number="${pageNumber}"] .${BUBBLE_CLASS}`
      );
      const optionPositions = bubbles.map((bubble): GridPosition => {
        // Use the grid coordinates for the center of the bubble
        const bubbleGridCoordinates = pixelPointToGridPoint(grid, {
          x: bubble.x + bubble.width / 2,
          y: bubble.y + bubble.height / 2,
        });
        const positionInfo = {
          sheetNumber: Math.ceil(pageNumber / 2),
          side: pageNumber % 2 === 1 ? 'front' : 'back',
          ...bubbleGridCoordinates,
        } as const;
        const optionInfo = JSON.parse(bubble.data.optionInfo) as OptionInfo;
        switch (optionInfo.type) {
          case 'option':
            return {
              ...positionInfo,
              ...optionInfo,
            };
          case 'write-in': {
            return {
              ...positionInfo,
              ...optionInfo,
              writeInArea: {
                x: positionInfo.column - optionInfo.writeInArea.left,
                y: positionInfo.row - optionInfo.writeInArea.top,
                width:
                  optionInfo.writeInArea.left + optionInfo.writeInArea.right,
                height:
                  optionInfo.writeInArea.top + optionInfo.writeInArea.bottom,
              },
            };
          }
          default:
            return throwIllegalValue(optionInfo);
        }
      });
      return optionPositions;
    })
  );
  const gridPositions = optionPositionsPerPage.flat();

  // To compute the bounds of options, we'll look at the first write-in option
  // box we find. We use this value for every contest option on the ballot.
  // We use a write-in option box rather than a candidate option box because
  // it is the larger of the two and gives us more margin for error. If there
  // are no write-ins, we fallback to a candidate option and then a ballot measure
  // option. We may want to eventually switch to a data model where we compute bounds
  // for every contest option we care about individually, since write-in and candidate
  // options are not the same size.
  const optionBoundsFromTargetMark: Outset<number> = await (async () => {
    // All bubble ballots are a special case of a valid ballot with no contest options
    if (isAllBubbleBallot) {
      return { top: 0, left: 0, right: 0, bottom: 0 };
    }

    let optionElement: DocumentElement | null = null;
    let bubbleElement: DocumentElement | null = null;

    const writeInOptions = await document.inspectElements(
      `.${WRITE_IN_OPTION_CLASS}`
    );
    if (writeInOptions.length > 0) {
      [optionElement] = writeInOptions;
      [bubbleElement] = await document.inspectElements(
        `.${WRITE_IN_OPTION_CLASS} .${BUBBLE_CLASS}`
      );
    }

    if (optionElement === null) {
      const candidateOptions = await document.inspectElements(
        `.${CANDIDATE_OPTION_CLASS}`
      );
      if (candidateOptions.length > 0) {
        [optionElement] = candidateOptions;
        [bubbleElement] = await document.inspectElements(
          `.${CANDIDATE_OPTION_CLASS} .${BUBBLE_CLASS}`
        );
      }
    }

    if (optionElement === null) {
      const ballotMeasureOptions = await document.inspectElements(
        `.${BALLOT_MEASURE_OPTION_CLASS}`
      );
      if (ballotMeasureOptions.length > 0) {
        [optionElement] = ballotMeasureOptions;
        [bubbleElement] = await document.inspectElements(
          `.${BALLOT_MEASURE_OPTION_CLASS} .${BUBBLE_CLASS}`
        );
      }
    }

    assert(
      optionElement !== null && bubbleElement !== null,
      'No contest option elements found on the ballot but at least one is required.'
    );

    const bubbleElementCenter: Point<Pixels> = {
      x: bubbleElement.x + bubbleElement.width / 2,
      y: bubbleElement.y + bubbleElement.height / 2,
    };
    const grid = await measureTimingMarkGrid(document, 1);
    const bounds: Outset<number> = {
      top: pixelsToGridHeight(grid, bubbleElementCenter.y - optionElement.y),
      left: pixelsToGridWidth(grid, bubbleElementCenter.x - optionElement.x),
      right: pixelsToGridWidth(
        grid,
        optionElement.x + optionElement.width - bubbleElementCenter.x
      ),
      bottom: pixelsToGridHeight(
        grid,
        optionElement.y + optionElement.height - bubbleElementCenter.y
      ),
    };
    return bounds;
  })();

  return {
    ballotStyleId,
    gridPositions,
    optionBoundsFromTargetMark,
  };
}

async function addQrCodesAndBallotHashes(
  document: RenderDocument,
  election: Election,
  metadata: Omit<HmpbBallotPageMetadata, 'pageNumber'>
) {
  const pages = await document.inspectElements(`.${PAGE_CLASS}`);
  for (const i of pages.keys()) {
    const pageNumber = i + 1;
    const encodedMetadata = encodeHmpbBallotPageMetadata(election, {
      ...metadata,
      pageNumber,
    });
    const qrCode = (
      <div
        style={{
          height: `${QR_CODE_SIZE.height}in`,
          width: `${QR_CODE_SIZE.width}in`,
        }}
      >
        <QrCode
          value={Buffer.from(encodedMetadata).toString('base64')}
          level="L"
        />
      </div>
    );
    await document.setContent(
      `.${PAGE_CLASS}[data-page-number="${pageNumber}"] .${QR_CODE_SLOT_CLASS}`,
      qrCode
    );
    await document.setContent(
      `.${PAGE_CLASS}[data-page-number="${pageNumber}"] .${BALLOT_HASH_SLOT_CLASS}`,
      <>{formatBallotHash(metadata.ballotHash)}</>
    );
  }
}

/**
 * Given a ballot render document, renders the ballot as a PDF. Adds a QR code
 * with the ballot metadata (unless it's a sample ballot).
 */
export async function renderBallotPdfWithMetadataQrCode(
  props: BaseBallotProps,
  document: RenderDocument,
  electionDefinition: ElectionDefinition
): Promise<Uint8Array> {
  if (props.ballotMode !== 'sample') {
    await addQrCodesAndBallotHashes(document, electionDefinition.election, {
      ballotHash: electionDefinition.ballotHash,
      ballotStyleId: props.ballotStyleId,
      precinctId: props.precinctId,
      ballotType: props.ballotType,
      isTestMode: props.ballotMode !== 'official',
      ballotAuditId: props.ballotAuditId,
    });
  }

  return await document.renderToPdf();
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

/**
 * Given a {@link BallotPageTemplate} and a single set of props, renders a
 * ballot and returns the resulting PDF. Does not insert a QR code.
 */
export async function renderBallotPreviewToPdf<P extends object>(
  renderer: Renderer,
  template: BallotPageTemplate<P>,
  props: P
): Promise<Result<Uint8Array, BallotLayoutError>> {
  const result = await renderBallotTemplate(renderer, template, props);
  if (result.isErr()) {
    return result;
  }
  const document = result.ok();
  const pdf = await document.renderToPdf();
  document.cleanup();
  return ok(pdf);
}

/**
 * The base set of props that any {@link BallotPageTemplate} must use. This type
 * can be extended for ballots that require additional props.
 */
export interface BaseBallotProps {
  election: Election;
  ballotStyleId: BallotStyleId;
  precinctId: PrecinctId;
  ballotType: BallotType;
  ballotMode: BallotMode;
  watermark?: string;
  compact?: boolean;
  ballotAuditId?: string;
}

/**
 * Given a grid layout and a contest, returns the order of candidates as they
 * appear on the ballot. The ordering starts at the top of a contest and goes
 * down a column of options. If the contest spans multiple columns, orders the
 * columns left to right.
 */
function candidateOrderFromGridLayout(
  gridLayout: GridLayout,
  contest: CandidateContest
): CandidateId[] {
  const contestPositions = gridLayout.gridPositions.filter(
    (position): position is GridPositionOption =>
      position.contestId === contest.id && position.type === 'option'
  );
  assert(
    unique(contestPositions.map((p) => p.sheetNumber)).length <= 1,
    `Contest appears on multiple sheets: ${contest.id}`
  );
  return [...contestPositions]
    .sort((a, b) => a.row - b.row)
    .sort((a, b) => a.column - b.column)
    .map((p) => p.optionId);
}

/**
 * Given a {@link BallotPageTemplate} and a list of ballot props, lays out
 * each ballot for each set of props. Then, extracts the grid layout from the
 * ballot and creates an election definition. Returns the HTML content for each
 * ballot alongside the election definition.
 *
 * Note: This function does not insert metadata QR codes into the ballots.
 */
export async function layOutBallotsAndCreateElectionDefinition<
  P extends BaseBallotProps,
>(
  renderer: Renderer,
  template: BallotPageTemplate<P>,
  ballotProps: P[],
  electionSerializationFormat: ElectionSerializationFormat
): Promise<{
  ballotContents: string[];
  electionDefinition: ElectionDefinition;
}> {
  const { election } = ballotProps[0];
  assert(ballotProps.every((props) => props.election === election));

  const ballotLayouts = await iter(ballotProps)
    .async()
    .map(async (props, i) => {
      // We currently only need to return errors to the user in ballot preview -
      // we assume the ballot was proofed by the time this function is called.
      const document = (
        await renderBallotTemplate(renderer, template, props)
      ).unsafeUnwrap();
      const gridLayout = await extractGridLayout(
        document,
        props.ballotStyleId,
        template.isAllBubbleBallot
      );
      const ballotContent = await document.getContent();
      document.cleanup();
      const tmpFileName = tmpNameSync();
      await writeFile(tmpFileName, ballotContent);
      console.log(`Layed out ballot ${i}/${ballotProps.length}`);
      return {
        props,
        gridLayout,
        ballotContent: tmpFileName,
      };
    })
    .toArray();

  // All ballots of a given ballot style must have the same grid layout.
  // Changing precinct/ballot type/ballot mode shouldn't matter.
  const layoutsByBallotStyle = iter(ballotLayouts)
    .map((ballot) => ballot.gridLayout)
    .toMap((gridLayout) => gridLayout.ballotStyleId);
  for (const [ballotStyleId, layouts] of layoutsByBallotStyle.entries()) {
    const [firstLayout, ...restLayouts] = layouts;
    const hasDifferingLayout = restLayouts.some(
      (layout) => !deepEqual(layout, firstLayout)
    );
    if (hasDifferingLayout) {
      throw new Error(
        `Found multiple distinct grid layouts for ballot style ${ballotStyleId}`
      );
    }
  }
  // Now that all layouts for a ballot style are guaranteed to be equal, we can
  // just use one per ballot style
  const gridLayouts = iter(layoutsByBallotStyle.values())
    .map((layouts) => assertDefined(iter(layouts.values()).first()))
    .toArray();

  // Temporary workaround for candidate rotation to ensure that VxMark's voting
  // flow and tally reports in VxAdmin/VxScan list candidates in the same order
  // that they appear on the HMPB. (Eventually, we should use the gridLayouts
  // for that ordering instead of the election contests.)
  //
  // For each candidate contest: if all grid layouts have the same
  // ordering of candidates, change the election definition to also have that
  // ordering of candidates.
  const contests = election.contests.map((contest) => {
    if (template.isAllBubbleBallot) return contest;
    if (contest.type !== 'candidate') return contest;
    const gridLayoutsWithContest = gridLayouts.filter((layout) =>
      layout.gridPositions.some(
        (gridPosition) => gridPosition.contestId === contest.id
      )
    );
    if (gridLayoutsWithContest.length === 0) return contest;
    const [firstLayout, ...restLayouts] = gridLayoutsWithContest;
    const firstLayoutOrder = candidateOrderFromGridLayout(firstLayout, contest);
    if (
      restLayouts.every((layout) =>
        deepEqual(
          candidateOrderFromGridLayout(layout, contest),
          firstLayoutOrder
        )
      )
    ) {
      return {
        ...contest,
        candidates: firstLayoutOrder.map((candidateId) =>
          find(contest.candidates, (c) => c.id === candidateId)
        ),
      };
    }
    return contest;
  });

  const electionWithGridLayouts: Election = {
    ...election,
    contests,
    gridLayouts,
  };
  const electionToHash = (() => {
    switch (electionSerializationFormat) {
      case 'vxf': {
        // Re-parse the election to ensure it is being saved in a consistent format
        // zod parsing can change the order of fields when parsing the json object, and
        // maintainBackwardsCompatibility can alter some fields in the election. This ensures
        // that those changes occur before saving the file so that if that file is loaded back
        // through this code path the resulting election is identical and hashes to the same value.
        return safeParseElection(
          JSON.stringify(electionWithGridLayouts)
        ).unsafeUnwrap();
      }
      case 'cdf':
        return convertVxfElectionToCdfBallotDefinition(electionWithGridLayouts);
      default: {
        /* istanbul ignore next - @preserve */
        throwIllegalValue(electionSerializationFormat);
      }
    }
  })();
  const electionDefinition = safeParseElectionDefinition(
    JSON.stringify(electionToHash, null, 2)
  ).unsafeUnwrap();

  return {
    ballotContents: ballotLayouts.map(({ ballotContent }) => ballotContent),
    electionDefinition,
  };
}

export async function renderAllBallotPdfsAndCreateElectionDefinition<
  P extends BaseBallotProps,
>(
  renderer: Renderer,
  template: BallotPageTemplate<P>,
  ballotProps: P[],
  electionSerializationFormat: ElectionSerializationFormat
): Promise<{
  ballotPdfs: Uint8Array[];
  electionDefinition: ElectionDefinition;
}> {
  const { ballotContents, electionDefinition } =
    await layOutBallotsAndCreateElectionDefinition(
      renderer,
      template,
      ballotProps,
      electionSerializationFormat
    );

  const ballotPdfs = await iter(ballotProps)
    .zip(ballotContents)
    .async()
    .map(async ([props, ballotContent], i) => {
      const document = await renderer.loadDocumentFromContent(
        await readFile(ballotContent, 'utf-8')
      );
      void rm(ballotContent);
      const ballotPdf = await renderBallotPdfWithMetadataQrCode(
        props,
        document,
        electionDefinition
      );
      document.cleanup();
      console.log(`Rendered ballot PDF ${i}/${ballotProps.length}`);
      return ballotPdf;
    })
    .toArray();
  return { ballotPdfs, electionDefinition };
}

/**
 * Creates a list of the {@link BaseBallotProps} for all possible ballots -
 * every combination of ballot style, precinct, ballot type (precinct/absentee),
 * and ballot mode (official/test/sample).
 */
export function allBaseBallotProps(election: Election): BaseBallotProps[] {
  const ballotTypes = [BallotType.Precinct, BallotType.Absentee];
  return election.ballotStyles.flatMap((ballotStyle) =>
    ballotStyle.precincts.flatMap((precinctId) =>
      ballotTypes.flatMap((ballotType) =>
        BALLOT_MODES.map((ballotMode) => ({
          election,
          ballotStyleId: ballotStyle.id,
          precinctId,
          ballotType,
          ballotMode,
        }))
      )
    )
  );
}

/**
 * Lays out the minimal set of ballots required to create an election definition
 * with grid layouts included. Each ballot style will have exactly one grid
 * layout regardless of precinct, ballot type, or ballot mode. So we just need
 * to render a single ballot per ballot style to create the election definition
 */
export async function layOutMinimalBallotsToCreateElectionDefinition<
  P extends BaseBallotProps,
>(
  renderer: Renderer,
  template: BallotPageTemplate<P>,
  allBallotProps: P[],
  electionSerializationFormat: ElectionSerializationFormat
): Promise<ElectionDefinition> {
  const minimalBallotProps = groupBy(
    allBallotProps,
    (props) => props.ballotStyleId
  ).map(([, [, props]]) => props);
  const { electionDefinition } = await layOutBallotsAndCreateElectionDefinition(
    renderer,
    template,
    minimalBallotProps,
    electionSerializationFormat
  );
  return electionDefinition;
}
