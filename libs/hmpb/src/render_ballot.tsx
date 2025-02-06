import React from 'react';
import { Buffer } from 'node:buffer';
import {
  assert,
  assertDefined,
  deepEqual,
  groupBy,
  iter,
  ok,
  Result,
  throwIllegalValue,
} from '@votingworks/basics';
import {
  AnyContest,
  BallotStyleId,
  BallotType,
  Election,
  ElectionDefinition,
  ElectionSerializationFormat,
  GridLayout,
  GridPosition,
  HmpbBallotPageMetadata,
  Outset,
  PrecinctId,
  convertVxfElectionToCdfBallotDefinition,
  formatBallotHash,
  safeParseElection,
  safeParseElectionDefinition,
} from '@votingworks/types';
import { QrCode } from '@votingworks/ui';
import { encodeHmpbBallotPageMetadata, v3 } from '@votingworks/ballot-encoder';
import { RenderDocument, RenderScratchpad, Renderer } from './renderer';
import {
  BUBBLE_CLASS,
  CONTENT_SLOT_CLASS,
  ContentSlot,
  BALLOT_HASH_SLOT_CLASS,
  OptionInfo,
  PAGE_CLASS,
  QR_CODE_SIZE,
  QR_CODE_SLOT_CLASS,
  TIMING_MARK_CLASS,
  WRITE_IN_OPTION_CLASS,
  ContinueVotingFooterMessage,
  BallotCompleteFooterMessage,
} from './ballot_components';
import {
  BALLOT_MODES,
  BallotMode,
  PixelDimensions,
  Pixels,
  Point,
} from './types';

export type FrameComponent<P> = (
  props: P & {
    children: JSX.Element;
    pageNumber: number;
    totalPages: number;
    endOfPageInstruction?: JSX.Element;
  }
) => JSX.Element;

export interface PaginatedContent<P> {
  currentPageElement: JSX.Element;
  nextPageProps?: P;
}

interface ContestTooLongError {
  error: 'contestTooLong';
  contest: AnyContest;
}

export type BallotLayoutError = ContestTooLongError;

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
 * - A frame component (imagine it like a picture frame) that is rendered on each page
 * - A content component that knows how to render a page at a time of content
 * within the frame. Given a set of props (e.g. list of contests) the content component returns two items:
 *     - The content element for the current page (e.g. the contest boxes for this page)
 *     - The props for the next page (e.g. the contests that didn't fit on this page)
 */
export interface BallotPageTemplate<P extends object> {
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
async function paginateBallotContent<P extends object>(
  pageTemplate: BallotPageTemplate<P>,
  props: P,
  scratchpad: RenderScratchpad
): Promise<Result<JSX.Element[], BallotLayoutError>> {
  const pages: Array<PaginatedContent<P>> = [];

  const { frameComponent, contentComponent } = pageTemplate;
  do {
    const pageFrame = frameComponent({
      // eslint-disable-next-line vx/gts-spread-like-types
      ...props,
      pageNumber: pages.length + 1,
      totalPages: 0,
      children: <ContentSlot />,
    });
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

  const lastPageWithContentIndex = pages.length - 1;

  // If odd number of pages, add a final blank page
  if (pages.length % 2 === 1) {
    const lastPageResult = await contentComponent(undefined, scratchpad);
    if (lastPageResult.isErr()) {
      return lastPageResult;
    }
    pages.push(lastPageResult.ok());
  }

  return ok(
    pages.map((page, i) => {
      let endOfPageInstruction;
      if (i < lastPageWithContentIndex) {
        endOfPageInstruction = (
          <ContinueVotingFooterMessage pageNumber={i + 1} />
        );
      } else if (i === lastPageWithContentIndex) {
        endOfPageInstruction = <BallotCompleteFooterMessage />;
      } else {
        // Final blank page, if it exists, should have no footer message
      }

      return frameComponent({
        // eslint-disable-next-line vx/gts-spread-like-types
        ...props,
        pageNumber: i + 1,
        totalPages: pages.length,
        children: page.currentPageElement,
        endOfPageInstruction,
      });
    })
  );
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isV3Template(template: BallotPageTemplate<any>) {
  return 'machineVersion' in template && template.machineVersion === 'v3';
}

function snapCoordinatesToGrid(coordinates: { column: number; row: number }): {
  column: number;
  row: number;
} {
  const deltaColumn = Math.abs(
    coordinates.column - Math.round(coordinates.column)
  );
  const deltaRow = Math.abs(coordinates.row - Math.round(coordinates.row));
  assert(
    deltaColumn <= 0.1,
    'Column coordinate is not close to an integer - bubble may be misaligned'
  );
  assert(
    deltaRow <= 0.1,
    'Row coordinate is not close to an integer - bubble may be misaligned'
  );
  return {
    column: Math.round(coordinates.column),
    row: Math.round(coordinates.row),
  };
}

async function extractGridLayout(
  document: RenderDocument,
  ballotStyleId: BallotStyleId,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  template: BallotPageTemplate<any>
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
        let bubbleGridCoordinates = pixelPointToGridPoint(grid, {
          x: bubble.x + bubble.width / 2,
          y: bubble.y + bubble.height / 2,
        });
        if (isV3Template(template)) {
          bubbleGridCoordinates = snapCoordinatesToGrid(bubbleGridCoordinates);
        }
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

  // To compute the bounds of write-in options, we'll just look at the first
  // write-in option box we find. This relies on all write-in option boxes being
  // the same size. We may want to eventually switch to a data model where we
  // compute the bounds for every contest option we care about individually.
  const optionBoundsFromTargetMark: Outset<number> = await (async () => {
    const writeInOptions = await document.inspectElements(
      `.${WRITE_IN_OPTION_CLASS}`
    );
    const writeInOptionBubbles = await document.inspectElements(
      `.${WRITE_IN_OPTION_CLASS} .${BUBBLE_CLASS}`
    );
    if (writeInOptions.length === 0) {
      return {
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
      };
    }
    const firstWriteInOption = writeInOptions[0];
    const firstWriteInOptionBubble = writeInOptionBubbles[0];
    const firstWriteInOptionBubbleCenter: Point<Pixels> = {
      x: firstWriteInOptionBubble.x + firstWriteInOptionBubble.width / 2,
      y: firstWriteInOptionBubble.y + firstWriteInOptionBubble.height / 2,
    };
    const grid = await measureTimingMarkGrid(document, 1);
    let bounds: Outset<number> = {
      top: pixelsToGridHeight(
        grid,
        firstWriteInOptionBubbleCenter.y - firstWriteInOption.y
      ),
      left: pixelsToGridWidth(
        grid,
        firstWriteInOptionBubbleCenter.x - firstWriteInOption.x
      ),
      right: pixelsToGridWidth(
        grid,
        firstWriteInOption.x +
          firstWriteInOption.width -
          firstWriteInOptionBubbleCenter.x
      ),
      bottom: pixelsToGridHeight(
        grid,
        firstWriteInOption.y +
          firstWriteInOption.height -
          firstWriteInOptionBubbleCenter.y
      ),
    };
    if (isV3Template(template)) {
      bounds = {
        top: Math.ceil(bounds.top),
        left: Math.ceil(bounds.left),
        right: Math.ceil(bounds.right),
        bottom: Math.ceil(bounds.bottom),
      };
    }
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
  metadata: Omit<HmpbBallotPageMetadata, 'pageNumber'>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  template: BallotPageTemplate<any>
) {
  const pages = await document.inspectElements(`.${PAGE_CLASS}`);
  for (const i of pages.keys()) {
    const pageNumber = i + 1;
    let encodedMetadata = encodeHmpbBallotPageMetadata(election, {
      ...metadata,
      pageNumber,
    });
    if (isV3Template(template)) {
      encodedMetadata = v3.encodeHmpbBallotPageMetadata(election, {
        ...metadata,
        pageNumber,
      });
    }
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
    if (pageNumber % 2 === 1) {
      await document.setContent(
        `.${PAGE_CLASS}[data-page-number="${pageNumber}"] .${BALLOT_HASH_SLOT_CLASS}`,
        <>{formatBallotHash(metadata.ballotHash)}</>
      );
    }
  }
}

/**
 * Given a {@link BallotPageTemplate} and a single set of props, renders the
 * pages of the ballot and returns the resulting {@link RenderDocument}.
 */
export async function renderBallotTemplate<P extends object>(
  renderer: Renderer,
  template: BallotPageTemplate<P>,
  props: P
): Promise<Result<RenderDocument, BallotLayoutError>> {
  const scratchpad = await renderer.createScratchpad();
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
): Promise<Result<Buffer, BallotLayoutError>> {
  const document = await renderBallotTemplate(renderer, template, props);
  if (document.isErr()) {
    return document;
  }
  const pdf = await document.ok().renderToPdf();
  await renderer.cleanup();
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
}

/**
 * Given a {@link BallotPageTemplate} and a list of ballot props, renders
 * ballot for each set of props. Then, extracts the grid layout from the
 * rendered ballots and creates an election definition. Lastly, inserts QR codes
 * into the ballots with the resulting ballot hash.
 */
export async function renderAllBallotsAndCreateElectionDefinition<
  P extends BaseBallotProps,
>(
  renderer: Renderer,
  template: BallotPageTemplate<P>,
  ballotProps: P[],
  electionSerializationFormat: ElectionSerializationFormat
): Promise<{
  ballotDocuments: RenderDocument[];
  electionDefinition: ElectionDefinition;
}> {
  const { election } = ballotProps[0];
  assert(ballotProps.every((props) => props.election === election));

  const ballotsWithLayouts = await Promise.all(
    ballotProps.map(async (props) => {
      // We currently only need to return errors to the user in ballot preview -
      // we assume the ballot was proofed by the time this function is called.
      const document = (
        await renderBallotTemplate(renderer, template, props)
      ).unsafeUnwrap();
      const gridLayout = await extractGridLayout(
        document,
        props.ballotStyleId,
        template
      );
      return {
        document,
        gridLayout,
        props,
      };
    })
  );

  // All ballots of a given ballot style must have the same grid layout.
  // Changing precinct/ballot type/ballot mode shouldn't matter.
  const layoutsByBallotStyle = iter(ballotsWithLayouts)
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

  const electionWithGridLayouts: Election = {
    ...election,
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
        const sortedElectionWithGridLayouts = safeParseElection(
          JSON.stringify(electionWithGridLayouts)
        ).unsafeUnwrap();
        if (isV3Template(template)) {
          const date = new Date(election.date.toISOString());
          // Add one day to account for timezone bug in VxSuite v3
          date.setDate(date.getDate() + 1);
          return {
            ...sortedElectionWithGridLayouts,
            date: date.toISOString().split('T')[0],
          };
        }
        return sortedElectionWithGridLayouts;
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

  for (const { document, props } of ballotsWithLayouts) {
    if (props.ballotMode !== 'sample') {
      await addQrCodesAndBallotHashes(
        document,
        electionDefinition.election,
        {
          ballotHash: electionDefinition.ballotHash,
          ballotStyleId: props.ballotStyleId,
          precinctId: props.precinctId,
          ballotType: props.ballotType,
          isTestMode: props.ballotMode !== 'official',
        },
        template
      );
    }
  }

  return {
    ballotDocuments: ballotsWithLayouts.map((ballot) => ballot.document),
    electionDefinition,
  };
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
 * Renders the minimal set of ballots required to create an election definition
 * with grid layouts included. Each ballot style will have exactly one grid
 * layout regardless of precinct, ballot type, or ballot mode. So we just need
 * to render a single ballot per ballot style to create the election definition
 */
export async function renderMinimalBallotsToCreateElectionDefinition<
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
  const { electionDefinition } =
    await renderAllBallotsAndCreateElectionDefinition(
      renderer,
      template,
      minimalBallotProps,
      electionSerializationFormat
    );
  return electionDefinition;
}
