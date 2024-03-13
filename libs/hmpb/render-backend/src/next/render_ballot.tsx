import { Buffer } from 'buffer';
import { assert, deepEqual, uniqueBy } from '@votingworks/basics';
import {
  BallotStyle,
  BallotStyleId,
  BallotType,
  Election,
  ElectionDefinition,
  GridLayout,
  GridPosition,
  HmpbBallotPageMetadata,
  Precinct,
  safeParseElectionDefinition,
} from '@votingworks/types';
import { QrCode } from '@votingworks/ui';
import { encodeHmpbBallotPageMetadata } from '@votingworks/ballot-encoder';
import { BallotMode } from '@votingworks/hmpb-layout';
import { RenderDocument, RenderScratchpad, Renderer } from './renderer';
import {
  BUBBLE_CLASS,
  CONTENT_SLOT_CLASS,
  ContentSlot,
  OptionInfo,
  PAGE_CLASS,
  QR_CODE_SIZE,
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
      pagedContentResults[pagedContentResults.length - 1]?.nextPageProps ??
      props;

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
  } while (pagedContentResults[pagedContentResults.length - 1].nextPageProps);

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

async function extractGridLayout(
  document: RenderDocument,
  ballotStyleId: BallotStyleId
): Promise<GridLayout> {
  const pages = await document.inspectElements(`.${PAGE_CLASS}`);
  const optionPositionsPerPage = await Promise.all(
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

      // The grid origin is the center of the top-left timing mark
      const originX = minX + timingMarkElements[0].width / 2;
      const originY = minY + timingMarkElements[0].height / 2;

      // There are two overlayed timing marks in each corner, don't double count them
      const numTimingMarkRows =
        timingMarkElements.filter((mark) => mark.x === minX).length - 2;
      const numTimingMarkColumns =
        timingMarkElements.filter((mark) => mark.y === minY).length - 2;

      // The rows and columns of the grid are between the timing marks
      const gridColumnWidth = gridWidth / (numTimingMarkColumns - 1);
      const gridRowHeight = gridHeight / (numTimingMarkRows - 1);

      function pixelPointToGridPoint(
        x: number,
        y: number
      ): { column: number; row: number } {
        return {
          column: (x - originX) / gridColumnWidth,
          row: (y - originY) / gridRowHeight,
        };
      }

      const bubbles = await document.inspectElements(
        `.${PAGE_CLASS}[data-page-number="${pageNumber}"] .${BUBBLE_CLASS}`
      );
      const optionPositions = bubbles.map((bubble): GridPosition => {
        const positionInfo = {
          sheetNumber: Math.ceil(pageNumber / 2),
          side: pageNumber % 2 === 1 ? 'front' : 'back',
          // Use the grid coordinates for the center of the bubble
          ...pixelPointToGridPoint(
            bubble.x + bubble.width / 2,
            bubble.y + bubble.height / 2
          ),
        } as const;
        const optionInfo = JSON.parse(bubble.data.optionInfo) as OptionInfo;
        if (optionInfo.type === 'write-in') {
          return {
            ...positionInfo,
            ...optionInfo,
            // TODO convert writeInArea from bubble-relative grid coordinates to
            // absolute pixel coordinates
            writeInArea: {
              x: 0,
              y: 0,
              width: 0,
              height: 0,
            },
          };
        }
        return {
          ...positionInfo,
          ...optionInfo,
        };
      });
      return optionPositions;
    })
  );

  return {
    ballotStyleId,
    gridPositions: optionPositionsPerPage.flat(),
    // TODO how should this crop area be specified?
    optionBoundsFromTargetMark: {
      bottom: 0,
      left: 0,
      right: 0,
      top: 0,
    },
  };
}

async function addQrCodes(
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
  }
}

async function renderBallotTemplate<P extends object>(
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

export async function renderBallotPreviewToPdf<P extends object>(
  renderer: Renderer,
  template: BallotPageTemplate<P>,
  props: P
): Promise<Buffer> {
  const t1 = Date.now();
  const document = await renderBallotTemplate(renderer, template, props);
  const pdf = await document.renderToPdf();
  const t2 = Date.now();
  // eslint-disable-next-line no-console
  console.log(`Rendered document in ${t2 - t1}ms`);
  await document.dispose();
  await renderer.cleanup();
  return pdf;
}

export interface BaseBallotProps {
  election: Election;
  ballotStyle: BallotStyle;
  precinct: Precinct;
  ballotType: BallotType;
  ballotMode: BallotMode;
}

export async function renderAllBallotsAndCreateElectionDefinition<
  P extends BaseBallotProps,
>(
  renderer: Renderer,
  template: BallotPageTemplate<P>,
  ballotProps: P[]
): Promise<{
  ballotDocuments: RenderDocument[];
  electionDefinition: ElectionDefinition;
}> {
  const { election } = ballotProps[0];
  assert(ballotProps.every((props) => props.election === election));

  const ballotsWithLayouts = await Promise.all(
    ballotProps.map(async (props) => {
      const document = await renderBallotTemplate(renderer, template, {
        ...props, // eslint-disable-line vx/gts-spread-like-types
        election,
      });
      const gridLayout = await extractGridLayout(
        document,
        props.ballotStyle.id
      );
      return {
        document,
        gridLayout,
        props,
      };
    })
  );

  // All precincts for a given ballot style have the same grid layout
  // TODO check that this is actually true before de-duping to protect against
  // templates that violate this rule
  const gridLayouts = uniqueBy(
    ballotsWithLayouts.map((ballot) => ballot.gridLayout),
    (layout) => layout.ballotStyleId
  );

  const electionWithGridLayouts: Election = { ...election, gridLayouts };
  const electionDefinition = safeParseElectionDefinition(
    JSON.stringify(electionWithGridLayouts, null, 2)
  ).unsafeUnwrap();

  for (const { document, props } of ballotsWithLayouts) {
    if (props.ballotMode !== 'sample') {
      await addQrCodes(document, electionDefinition.election, {
        electionHash: electionDefinition.electionHash,
        ballotStyleId: props.ballotStyle.id,
        precinctId: props.precinct.id,
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
