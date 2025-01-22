import React from 'react';
import { Buffer } from 'node:buffer';
import {
  assert,
  assertDefined,
  deepEqual,
  iter,
  throwIllegalValue,
} from '@votingworks/basics';
import {
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
import { encodeHmpbBallotPageMetadata } from '@votingworks/ballot-encoder';
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
} from './ballot_components';
import { BallotMode, PixelDimensions, Pixels, Point } from './types';

export type FrameComponent<P> = (
  props: P & { children: JSX.Element; pageNumber: number; totalPages: number }
) => JSX.Element;

export interface PagedElementResult<P> {
  currentPageElement: JSX.Element;
  nextPageProps?: P;
}

export type ContentComponent<P> = (
  props: (P & { dimensions: PixelDimensions }) | undefined,
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
): Promise<JSX.Element[]> {
  const pagedContentResults: Array<PagedElementResult<P>> = [];

  const { frameComponent, contentComponent } = pageTemplate;
  let numLoopsWithSameProps = 0;
  do {
    const pageFrame = frameComponent({
      // eslint-disable-next-line vx/gts-spread-like-types
      ...props,
      pageNumber: pagedContentResults.length + 1,
      totalPages: 0,
      children: <ContentSlot />,
    });
    const [contentSlotMeasurements] = await scratchpad.measureElements(
      pageFrame,
      `.${CONTENT_SLOT_CLASS}`
    );
    const currentPageProps: P =
      pagedContentResults.at(-1)?.nextPageProps ?? props;

    if (
      deepEqual(
        currentPageProps,
        pagedContentResults[pagedContentResults.length - 2]?.nextPageProps
      )
    ) {
      numLoopsWithSameProps += 1;
    } else {
      numLoopsWithSameProps = 0;
    }
    if (numLoopsWithSameProps > 1) {
      throw new Error('Contest is too tall to fit on page');
    }

    const pagedContentResult = await contentComponent(
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
    pagedContentResults.push(pagedContentResult);
  } while (pagedContentResults.at(-1)?.nextPageProps);

  if (pagedContentResults.length % 2 === 1) {
    pagedContentResults.push(await contentComponent(undefined, scratchpad));
  }

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
  ballotStyleId: BallotStyleId
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
        const positionInfo = {
          sheetNumber: Math.ceil(pageNumber / 2),
          side: pageNumber % 2 === 1 ? 'front' : 'back',
          // Use the grid coordinates for the center of the bubble
          ...pixelPointToGridPoint(grid, {
            x: bubble.x + bubble.width / 2,
            y: bubble.y + bubble.height / 2,
          }),
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
    return {
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
): Promise<RenderDocument> {
  const scratchpad = await renderer.createScratchpad();
  const pages = await paginateBallotContent(template, props, scratchpad);
  const document = scratchpad.convertToDocument();
  await document.setContent('body', <>{pages}</>);
  return document;
}

/**
 * Given a {@link BallotPageTemplate} and a single set of props, renders a
 * ballot and returns the resulting PDF. Does not insert a QR code.
 */
export async function renderBallotPreviewToPdf<P extends object>(
  renderer: Renderer,
  template: BallotPageTemplate<P>,
  props: P
): Promise<Buffer> {
  const document = await renderBallotTemplate(renderer, template, props);
  const pdf = await document.renderToPdf();
  await renderer.cleanup();
  return pdf;
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
      const document = await renderBallotTemplate(renderer, template, props);
      const gridLayout = await extractGridLayout(document, props.ballotStyleId);
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
      await addQrCodesAndBallotHashes(document, electionDefinition.election, {
        ballotHash: electionDefinition.ballotHash,
        ballotStyleId: props.ballotStyleId,
        precinctId: props.precinctId,
        ballotType: props.ballotType,
        isTestMode: props.ballotMode !== 'official',
      });
    }
  }

  return {
    ballotDocuments: ballotsWithLayouts.map((ballot) => ballot.document),
    electionDefinition,
  };
}
