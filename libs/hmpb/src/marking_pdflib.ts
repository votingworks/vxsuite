import {
  appendBezierCurve,
  fill,
  lineTo,
  moveTo,
  PDFDocument,
  PDFPage,
  setFillingGrayscaleColor,
} from 'pdf-lib';
import fontKit from '@pdf-lib/fontkit';
import fs from 'node:fs';

import { assert } from '@votingworks/basics';
import {
  ballotPaperDimensions,
  Election,
  GridPosition,
  Rect,
  Vote,
  VotesDict,
} from '@votingworks/types';

import {
  BUBBLE_HEIGHT_PX,
  BUBBLE_WIDTH_PX,
  pageMarginsInches,
  TIMING_MARK_DIMENSIONS,
  timingMarkCounts,
} from './ballot_components';
import { PrintCalibration } from './types';

const robotoBoldTtf = fs.readFileSync(`${__dirname}/fonts/Roboto-Bold.ttf`);

// NOTE: All values used in this module are in PDF user space `pt` units.

const PT = 1;
const IN = 72 * PT;
const MM = IN / 25.4;
const PX = IN / 96;

const pageMargins = [
  pageMarginsInches.left * IN,
  pageMarginsInches.top * IN,
] as const;

const timingMarkSize = [
  TIMING_MARK_DIMENSIONS.width * IN,
  TIMING_MARK_DIMENSIONS.height * IN,
] as const;

const bubbleSize = [BUBBLE_WIDTH_PX * PX, BUBBLE_HEIGHT_PX * PX] as const;
// We grow the mark slightly to help make up for slight variations in printing:
const markSize = [bubbleSize[0] * 1.2, bubbleSize[1] * 1.2] as const;
const markBorderRadius = markSize[1] * 0.5;
const markSizeHalf = [markSize[0] * 0.5, markSize[1] * 0.5] as const;

const writeInFontSizeDefault = 12;
const writeInFontSizeReduced = 10;

/**
 * Generates a PDF with bubble marks in the expected positions for the given
 * ballot style and corresponding votes.
 *
 * If {@link baseBallotPdf} is specified, the existing pages will be used as
 * base layers for the bubble marks in the generated PDF.
 */
export async function generateMarkOverlay(
  election: Election,
  ballotStyleId: string,
  votes: VotesDict,
  calibration: PrintCalibration,
  baseBallotPdf?: Uint8Array
): Promise<Uint8Array> {
  assert(
    election.gridLayouts,
    'cannot generate mark overlay for election with no grid layouts'
  );

  const layout = election.gridLayouts.find(
    (l) => l.ballotStyleId === ballotStyleId
  );
  assert(layout, `no grid layout found for ballot style ${ballotStyleId}`);

  /**
   * Center of the top-left timing mark, potentially adjusted per
   * machine-specific calibration.
   *
   * [TODO] We may need to move the uncalibrated origin into the election
   * definition, to support marking 3rd party ballots.
   */
  const gridOrigin = [
    pageMargins[0] + 0.5 * timingMarkSize[0] + calibration.offsetMmX * MM,
    pageMargins[1] + 0.5 * timingMarkSize[1] + calibration.offsetMmY * MM,
  ] as const;

  const pageSizeIn = ballotPaperDimensions(election.ballotLayout.paperSize);
  const pageSize = [pageSizeIn.width * IN, pageSizeIn.height * IN] as const;

  const timingMarkCount = timingMarkCounts(pageSizeIn);
  const gridSize = [
    pageSize[0] - 2 * pageMargins[0] - timingMarkSize[0],
    pageSize[1] - 2 * pageMargins[1] - timingMarkSize[1],
  ];

  const doc = baseBallotPdf
    ? await PDFDocument.load(baseBallotPdf)
    : await PDFDocument.create();

  if (baseBallotPdf) {
    const basePageSize = doc.getPage(0).getSize();
    assert(
      basePageSize.width === pageSize[0] && basePageSize.height === pageSize[1],
      `base PDF size ([${basePageSize.width},${basePageSize.height}]) does` +
        `not match expected(${pageSize})`
    );
  }

  doc.registerFontkit(fontKit);
  const fontRobotoBold = await doc.embedFont(robotoBoldTtf);

  for (const pos of layout.gridPositions) {
    let pageNumber = pos.sheetNumber * 2;
    if (pos.side === 'front') pageNumber -= 1;

    if (!baseBallotPdf) {
      while (doc.getPageCount() < pageNumber) {
        const page = doc.addPage();
        page.setSize(...pageSize);
      }
    }

    const contestVotes = votes[pos.contestId];
    if (!contestVotes) continue;

    const mark = markInfo(contestVotes, pos);
    if (!mark) continue;

    const page = doc.getPage(pageNumber - 1); // Pages are 0-indexed.

    const bubbleCenter = [
      gridOrigin[0] + gridSize[0] * (pos.column / (timingMarkCount.x - 1)),
      gridOrigin[1] + gridSize[1] * (pos.row / (timingMarkCount.y - 1)),
    ];

    bubbleMark(page, [
      bubbleCenter[0] - markSizeHalf[0],
      // Transform top to PDF user space (page origin at bottom-left).
      pageSize[1] - bubbleCenter[1] + markSizeHalf[1],
    ]);

    if (!mark.writeInName) continue;

    // Add write-in candidate name within the configured search area:

    const { writeInArea: area, writeInName: name } = mark;
    const origin = [
      gridOrigin[0] + gridSize[0] * (area.x / (timingMarkCount.x - 1)),
      gridOrigin[1] + gridSize[1] * (area.y / (timingMarkCount.y - 1)),
    ];
    const areaSize = [
      area.width * (gridSize[0] / (timingMarkCount.x - 1)),
      area.height * (gridSize[1] / (timingMarkCount.y - 1)),
    ];

    let fontSize = writeInFontSizeDefault;

    // Reduce font size for long write-ins.
    if (fontRobotoBold.widthOfTextAtSize(name, fontSize) > areaSize[0]) {
      fontSize = writeInFontSizeReduced;
    }

    // Center the write-in text within the write-in area.
    origin[1] += 0.5 * (areaSize[1] - fontSize);

    page.drawText(name, {
      font: fontRobotoBold,
      size: fontSize,
      x: origin[0],
      // Transform y to PDF user space (page and text origins at bottom-left).
      y: pageSize[1] - origin[1] - fontSize,
    });
  }

  // Make sure we have an even number of pages, to match print order of the base
  // ballot sheets (paper paths differ between simplex vs duplex printing).
  if (doc.getPageCount() % 2) doc.addPage().setSize(pageSize[0], pageSize[1]);

  return doc.save();
}

type MarkInfo =
  | { writeInName?: undefined }
  | { writeInArea: Rect; writeInName: string };

function markInfo(votes: Vote, gridPos: GridPosition): MarkInfo | null {
  for (const vote of votes) {
    if (gridPos.type === 'write-in') {
      assert(typeof vote !== 'string', 'expected candidate vote, got yes/no');

      if (gridPos.writeInIndex === vote.writeInIndex) {
        return {
          writeInArea: gridPos.writeInArea,
          writeInName: vote.name,
        };
      }

      continue;
    }

    if (typeof vote === 'string') {
      if (vote === gridPos.optionId) return {};
      continue;
    }

    if (vote.id === gridPos.optionId) return {};
  }

  return null;
}

/**
 * Radius multiplier for the distance from bezier curve control points to the
 * start/end points required to approximate a quarter-circle arc.
 */
const arcControlPointDistPerRadius = (4 * (Math.sqrt(2) - 1)) / 3;

const markControlPointDist = markBorderRadius * arcControlPointDistPerRadius;

const markLenTop = markSize[0] - 2 * markBorderRadius;
const markLenBottom = markSize[0] - 2 * markBorderRadius;

/**
 * Appends a filled, rounded-rectangle bubble mark path to the given page.
 *
 * @param page - A PDF-lib page object.
 * @param originTopLeft - Coordinates for the top-left corner of the bubble
 *   mark, in PDF user-space (page origin at bottom-left).
 */
function bubbleMark(page: PDFPage, originTopLeft: [number, number]): void {
  // Following operations are in PDF user space (page origin at bottom-left):

  const radius = markBorderRadius;
  const p1: [number, number] = [originTopLeft[0] + radius, originTopLeft[1]];
  const p2: [number, number] = [p1[0] + markLenTop, p1[1]];

  // Top line:
  page.pushOperators(
    setFillingGrayscaleColor(0),
    moveTo(...p1),
    lineTo(...p2)
    // Prevent `prettier` inlining for clarity.
  );

  // Top-right arc:
  [p1[0], p1[1]] = p2;
  p2[0] += radius;
  p2[1] -= radius;
  page.pushOperators(
    appendBezierCurve(
      p1[0] + markControlPointDist,
      p1[1],

      p2[0],
      p2[1] + markControlPointDist,

      p2[0],
      p2[1]
    )
  );

  // Bottom-right arc:
  [p1[0], p1[1]] = p2;
  p2[0] -= radius;
  p2[1] -= radius;
  page.pushOperators(
    appendBezierCurve(
      p1[0],
      p1[1] - markControlPointDist,

      p2[0] + markControlPointDist,
      p2[1],

      p2[0],
      p2[1]
    )
  );

  // Bottom line:
  [p1[0], p1[1]] = p2;
  p2[0] -= markLenBottom;
  page.pushOperators(lineTo(...p2));

  // Bottom-left arc:
  [p1[0], p1[1]] = p2;
  p2[0] -= radius;
  p2[1] += radius;
  page.pushOperators(
    appendBezierCurve(
      p1[0] - markControlPointDist,
      p1[1],

      p2[0],
      p2[1] - markControlPointDist,

      p2[0],
      p2[1]
    )
  );

  // Top-left arc:
  [p1[0], p1[1]] = p2;
  p2[0] += radius;
  p2[1] += radius;
  page.pushOperators(
    appendBezierCurve(
      p1[0],
      p1[1] + markControlPointDist,

      p2[0] - markControlPointDist,
      p2[1],

      p2[0],
      p2[1]
    )
  );

  // End path:
  page.pushOperators(fill());
}
