import {
  appendBezierCurve,
  concatTransformationMatrix,
  drawObject,
  fill,
  lineTo,
  moveTo,
  PDFDocument,
  type PDFOperator,
  type PDFRef,
  popGraphicsState,
  pushGraphicsState,
  setFillingGrayscaleColor,
  setLineWidth,
  setStrokingGrayscaleColor,
  stroke,
} from 'pdf-lib';
import fontKit from '@pdf-lib/fontkit';

import { assert, throwIllegalValue } from '@votingworks/basics';
import { normalizePdf } from '@votingworks/image-utils/pdf';
import {
  ballotPaperDimensions,
  type BallotPaperSize,
  type Candidate,
  type Contest,
  type GridPoint,
  type GridPosition,
  gridPositionsFromBallotPositions,
  type Rect,
  type SheetPositions,
  type Vote,
  type VotesDict,
} from '@votingworks/types';

import {
  BUBBLE_HEIGHT_PX,
  BUBBLE_WIDTH_PX,
  pageMarginsInches,
  TIMING_MARK_DIMENSIONS,
  timingMarkCounts,
} from './ballot_components.js';
import {
  type InchDimensions,
  NO_PRINT_CALIBRATION,
  type PrintCalibration,
} from './types.js';
import { voteMatchesGridPosition } from './vote_matching.js';
import { drawWriteInText } from './write_in_text.js';
import { getRobotoBoldData } from './fonts.js';

// NOTE: All values used in this module are in PDF user space `pt` units.

const PT = 1;
const IN = 72 * PT;
const MM = IN / 25.4;
const PX = IN / 96;

type PdfVec = readonly [x: number, y: number];

const pageMargins: PdfVec = [
  pageMarginsInches.left * IN,
  pageMarginsInches.top * IN,
];

const timingMarkSize: PdfVec = [
  TIMING_MARK_DIMENSIONS.width * IN,
  TIMING_MARK_DIMENSIONS.height * IN,
];

const bubbleBorderWidth = 1 * PX;
const bubbleSize: PdfVec = [BUBBLE_WIDTH_PX * PX, BUBBLE_HEIGHT_PX * PX];
const bubbleSizeHalf: PdfVec = [0.5 * bubbleSize[0], 0.5 * bubbleSize[1]];

// We grow the mark slightly to help make up for slight variations in printing:
const markSize: PdfVec = [bubbleSize[0] * 1.2, bubbleSize[1] * 1.2];
const markSizeHalf: PdfVec = [markSize[0] * 0.5, markSize[1] * 0.5];

/**
 * Distance between the centers of adjacent timing marks, in `pt` - the pitch of
 * the timing mark grid, not the blank space between one mark and the next. Grid
 * coordinates in ballot positions - including write-in area dimensions - are in
 * these units.
 *
 * This is the same quantity as the `columnGap`/`rowGap` of the
 * {@link GridMeasurements} that {@link measureTimingMarkGrid} returns, but
 * computed from the paper size rather than measured from a rendered ballot: we
 * only have a PDF here, not a rendered document to inspect.
 */
export function gridSpacing(pageDimensions: InchDimensions): {
  columnGap: number;
  rowGap: number;
} {
  const timingMarkCount = timingMarkCounts(pageDimensions);
  return {
    columnGap:
      (pageDimensions.width * IN - 2 * pageMargins[0] - timingMarkSize[0]) /
      (timingMarkCount.x - 1),
    rowGap:
      (pageDimensions.height * IN - 2 * pageMargins[1] - timingMarkSize[1]) /
      (timingMarkCount.y - 1),
  };
}

export interface MarkOverlayParams {
  baseBallotPdf?: Uint8Array;
  calibration: PrintCalibration;
  contests: readonly Contest[];
  positions: readonly SheetPositions[];
  size: BallotPaperSize;
  votes: VotesDict;
}

/**
 * Generates a PDF with bubble marks in the given positions with corresponding
 * corresponding votes.
 *
 * If {@link MarkOverlayParams.baseBallotPdf} is specified, the marks will be
 * composited on top of the base ballot PDF. Otherwise, a new PDF with just the
 * marks is created.
 *
 * Intended for printing over pre-printed HMPBs or for bubble ballot marking.
 */
export async function generateMarkOverlay(
  p: MarkOverlayParams
): Promise<Uint8Array> {
  // [TODO] Use the `SheetPosition`s directly, since we can index into `votes`
  // with the included contests IDs.
  const gridPositions = gridPositionsFromBallotPositions(p.positions);

  const pageSizeIn = ballotPaperDimensions(p.size);
  const pageSize = [pageSizeIn.width * IN, pageSizeIn.height * IN] as const;
  const gridToPdf = newGridToPdfTransform(pageSizeIn, p.calibration);
  const spacing = gridSpacing(pageSizeIn);

  // Load base ballot PDF or create a new document
  const doc = p.baseBallotPdf
    ? await PDFDocument.load(p.baseBallotPdf)
    : await PDFDocument.create();

  if (p.baseBallotPdf) {
    const basePageSize = doc.getPage(0).getSize();
    assert(
      basePageSize.width === pageSize[0] && basePageSize.height === pageSize[1],
      `base PDF size ([${basePageSize.width},${basePageSize.height}]) does ` +
        `not match expected (${pageSize})`
    );
  }

  doc.registerFontkit(fontKit);
  const fontRobotoBold = await doc.embedFont(await getRobotoBoldData());

  for (const pos of gridPositions) {
    let pageNumber = pos.sheetNumber * 2;
    if (pos.side === 'front') pageNumber -= 1;

    // Create pages if they don't exist (for non-base ballot case)
    if (!p.baseBallotPdf) {
      while (doc.getPageCount() < pageNumber) {
        const page = doc.addPage();
        page.setSize(pageSize[0], pageSize[1]);
      }
    }

    const contestVotes = p.votes[pos.contestId];
    if (!contestVotes) continue;

    const contest = p.contests.find((c) => c.id === pos.contestId);
    assert(contest, `contest ${pos.contestId} not found`);

    const mark = markInfo(contestVotes, pos, contest, { gridPositions });
    if (!mark) continue;

    const page = doc.getPage(pageNumber - 1);

    const bubbleCenter = gridToPdf(pos);
    page.pushOperators(
      setFillingGrayscaleColor(0),
      ...bubblePath(
        [bubbleCenter[0] - markSizeHalf[0], bubbleCenter[1] + markSizeHalf[1]],
        markSize
      ),
      fill()
    );

    if (!mark.writeInName) continue;

    // Add write-in candidate name within the configured search area
    const { writeInArea: area, writeInName: name } = mark;
    const origin = gridToPdf({ column: area.x, row: area.y });
    const areaSize = [
      area.width * spacing.columnGap,
      area.height * spacing.rowGap,
    ] as const;

    drawWriteInText(page, fontRobotoBold, name, {
      x: origin[0],
      y: origin[1] - areaSize[1],
      width: areaSize[0],
      height: areaSize[1],
    });
  }

  // Make sure we have an even number of pages, to match print order of the base
  // ballot sheets (paper paths differ between simplex vs duplex printing).
  if (doc.getPageCount() % 2) doc.addPage().setSize(pageSize[0], pageSize[1]);

  return normalizePdf(await doc.save({ useObjectStreams: false }));
}

export type BubbleStyle = 'filled' | 'outline';

export interface BubbleConfig {
  positions: readonly SheetPositions[];
  paperSize: BallotPaperSize;
  style: BubbleStyle;
}

/**
 * Creates a copy of the PDF with bubble shapes stamped at the given positions.
 *
 * See {@link stampBubblesInDoc} for details.
 */
export async function stampBubbles(
  pdf: Readonly<Uint8Array>,
  cfg: BubbleConfig
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdf);
  stampBubblesInDoc(doc, cfg);
  return normalizePdf(await doc.save({ useObjectStreams: false }));
}

/**
 * Stamps bubble shapes at the given positions in an existing `pdf-lib` document.
 * Writes bubbles as lightweight references to a single template object to
 * avoid bloat from repeated instances.
 *
 * Useful for adding vote marks to an existing ballot and/or adding bubble
 * outlines at pre-computed positions (e.g. all-bubble ballot).
 */
export function stampBubblesInDoc(doc: PDFDocument, cfg: BubbleConfig): void {
  assert(
    doc.getPageCount() >= cfg.positions.length * 2,
    'ballot position pages exceed PDF page count - add pages to the PDF first'
  );

  const pageSizeInches = ballotPaperDimensions(cfg.paperSize);
  const gridToPdf = newGridToPdfTransform(pageSizeInches, NO_PRINT_CALIBRATION);
  const bubbleRef = embedBubbleTemplate(doc, cfg.style);

  for (const [pageIndex, pagePositions] of cfg.positions.flat().entries()) {
    const page = doc.getPage(pageIndex);
    const bubbleRefForPage = page.node.newXObject('bubble', bubbleRef);

    for (const contestPositions of pagePositions) {
      for (const pos of contestPositions.options) {
        const center = gridToPdf(pos.bubbleCenter);
        const originX = center[0] - bubbleSizeHalf[0];
        const originY = center[1] - bubbleSizeHalf[1];

        page.pushOperators(
          pushGraphicsState(),
          concatTransformationMatrix(1, 0, 0, 1, originX, originY),
          drawObject(bubbleRefForPage),
          popGraphicsState()
        );
      }
    }
  }
}

function embedBubbleTemplate(doc: PDFDocument, style: BubbleStyle): PDFRef {
  const [w, h] = bubbleSize;

  const ops: PDFOperator[] = (() => {
    switch (style) {
      case 'filled':
        return [
          setFillingGrayscaleColor(0),
          ...bubblePath([0, h], bubbleSize),
          fill(),
        ];

      case 'outline': {
        const borderInset = 0.5 * bubbleBorderWidth;
        return [
          setLineWidth(bubbleBorderWidth),
          setStrokingGrayscaleColor(0),
          ...bubblePath(
            [borderInset, h - borderInset],
            [w - bubbleBorderWidth, h - bubbleBorderWidth]
          ),
          stroke(),
        ];
      }

      default:
        return throwIllegalValue(style);
    }
  })();

  // Extra wiggle room for the bounding box, to avoid any potential clipping
  // of the bubble border during rasterization.
  const pad = 2 * PT;

  return doc.context.register(
    // eslint-disable-next-line vx/gts-identifiers
    doc.context.formXObject(ops, { BBox: [-pad, -pad, w + pad, h + pad] })
  );
}

/**
 * Radius multiplier for the distance from bezier curve control points to the
 * start/end points required to approximate a quarter-circle arc.
 */
const ARC_CONTROL_POINT_DIST_PER_RADIUS = (4 * (Math.sqrt(2) - 1)) / 3;

/**
 * Generates PDF path operators for a ballot bubble shape.
 */
function bubblePath(originTopLeft: PdfVec, size: PdfVec): PDFOperator[] {
  const radius = 0.5 * size[1];
  const controlPointDist = radius * ARC_CONTROL_POINT_DIST_PER_RADIUS;
  const straightEdgeLen = size[0] - 2 * radius;
  const p1: [number, number] = [originTopLeft[0] + radius, originTopLeft[1]];
  const p2: [number, number] = [p1[0] + straightEdgeLen, p1[1]];
  const ops: PDFOperator[] = [moveTo(...p1), lineTo(...p2)];

  [p1[0], p1[1]] = p2;
  p2[0] += radius;
  p2[1] -= radius;
  ops.push(
    appendBezierCurve(
      p1[0] + controlPointDist,
      p1[1],
      p2[0],
      p2[1] + controlPointDist,
      p2[0],
      p2[1]
    )
  );

  [p1[0], p1[1]] = p2;
  p2[0] -= radius;
  p2[1] -= radius;
  ops.push(
    appendBezierCurve(
      p1[0],
      p1[1] - controlPointDist,
      p2[0] + controlPointDist,
      p2[1],
      p2[0],
      p2[1]
    )
  );

  [p1[0], p1[1]] = p2;
  p2[0] -= straightEdgeLen;
  ops.push(lineTo(...p2));

  [p1[0], p1[1]] = p2;
  p2[0] -= radius;
  p2[1] += radius;
  ops.push(
    appendBezierCurve(
      p1[0] - controlPointDist,
      p1[1],
      p2[0],
      p2[1] - controlPointDist,
      p2[0],
      p2[1]
    )
  );

  [p1[0], p1[1]] = p2;
  p2[0] += radius;
  p2[1] += radius;
  ops.push(
    appendBezierCurve(
      p1[0],
      p1[1] + controlPointDist,
      p2[0] - controlPointDist,
      p2[1],
      p2[0],
      p2[1]
    )
  );

  return ops;
}

type MarkInfo =
  | { writeInName?: undefined }
  | { writeInArea: Rect; writeInName: string };

/**
 * Determines if this grid position should be marked based on the votes.
 *
 * For candidate contests with cross-endorsed candidates, we use the order of
 * grid positions to map to the order of OrderedCandidateOptions in the ballot
 * style. This allows us to correctly identify which specific bubble (with which
 * party affiliation) should be marked.
 */
function markInfo(
  votes: Vote,
  gridPos: GridPosition,
  contest: Contest,
  layout: { gridPositions: readonly GridPosition[] }
): MarkInfo | null {
  for (const vote of votes) {
    switch (contest.type) {
      case 'yesno':
      case 'straight-party': {
        assert(gridPos.type === 'option');
        if (vote === gridPos.optionId) return {};
        continue;
      }

      case 'candidate': {
        const candidateVote = vote as Candidate;
        if (gridPos.type === 'write-in') {
          if (gridPos.writeInIndex === candidateVote.writeInIndex) {
            return {
              writeInArea: gridPos.writeInArea,
              writeInName: candidateVote.name,
            };
          }

          continue;
        }

        if (
          voteMatchesGridPosition(candidateVote, gridPos, layout.gridPositions)
        ) {
          return {};
        }
        break;
      }

      default:
        throwIllegalValue(contest);
    }
  }

  return null;
}

/**
 * Returns a mapping function from timing mark grid coordinates, with a top-left
 * origin, to PDF-space coordinates, with a bottom-left origin.
 */
function newGridToPdfTransform(
  pageSizeInches: InchDimensions,
  calibration: PrintCalibration
): (p: GridPoint) => PdfVec {
  /**
   * Center of the top-left timing mark, potentially adjusted per
   * machine-specific calibration.
   *
   * [TODO] We may need to move the uncalibrated origin into the election
   * definition, to support marking 3rd party ballots.
   */
  const origin: PdfVec = [
    pageMargins[0] + 0.5 * timingMarkSize[0] + calibration.offsetMmX * MM,
    pageMargins[1] + 0.5 * timingMarkSize[1] + calibration.offsetMmY * MM,
  ];

  const pageSize: PdfVec = [
    pageSizeInches.width * IN,
    pageSizeInches.height * IN,
  ];

  const gridSize: PdfVec = [
    pageSize[0] - 2 * pageMargins[0] - timingMarkSize[0],
    pageSize[1] - 2 * pageMargins[1] - timingMarkSize[1],
  ];

  const cellCounts = timingMarkCounts(pageSizeInches);

  return (p) => {
    const x = origin[0] + gridSize[0] * (p.column / (cellCounts.x - 1));
    const y = origin[1] + gridSize[1] * (p.row / (cellCounts.y - 1));
    return [x, pageSize[1] - y];
  };
}
