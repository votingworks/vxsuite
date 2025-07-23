import PdfDocument from 'pdfkit';

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

const writeInFontName = 'Roboto-Bold';
const writeInFontSizeDefault = 12;
const writeInFontSizeReduced = 10;

/**
 * Generates a PDF with bubble marks in the expected positions for the given
 * ballot style and corresponding votes.
 *
 * Intended for printing over pre-printed HMPBs.
 */
export function generateMarkOverlay(
  election: Election,
  ballotStyleId: string,
  votes: VotesDict,
  calibration: PrintCalibration
): NodeJS.ReadableStream {
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

  const doc = new PdfDocument({
    bufferPages: true,
    size: pageSize as [number, number],
    compress: false,
  });
  doc.registerFont(writeInFontName, `${__dirname}/fonts/Roboto-Bold.ttf`);

  let pageCount = 1; // First page is added automatically.

  for (const pos of layout.gridPositions) {
    let pageNumber = pos.sheetNumber * 2;
    if (pos.side === 'front') pageNumber -= 1;

    while (pageCount < pageNumber) {
      doc.addPage();
      pageCount += 1;
    }

    const contestVotes = votes[pos.contestId];
    if (!contestVotes) continue;

    const mark = markInfo(contestVotes, pos);
    if (!mark) continue;

    doc.switchToPage(pageNumber - 1); // Pages are 0-indexed in `pdfkit`.

    const bubbleCenter = [
      gridOrigin[0] + gridSize[0] * (pos.column / (timingMarkCount.x - 1)),
      gridOrigin[1] + gridSize[1] * (pos.row / (timingMarkCount.y - 1)),
    ];

    doc
      .roundedRect(
        bubbleCenter[0] - markSizeHalf[0],
        bubbleCenter[1] - markSizeHalf[1],
        markSize[0],
        markSize[1],
        markBorderRadius
      )
      .fill([0, 0, 0]);

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

    doc.font(writeInFontName, fontSize);
    const textHeight = doc.heightOfString(name, { width: areaSize[0] });

    // Reduce font size for long write-ins.
    if (textHeight > doc.currentLineHeight()) {
      fontSize = writeInFontSizeReduced;
    }

    // Center the write-in text within the write-in area.
    origin[1] += 0.5 * (areaSize[1] - fontSize);

    doc.font(writeInFontName, fontSize).text(name, origin[0], origin[1], {
      align: 'left',
      height: areaSize[1],
      width: areaSize[0],
    });
  }

  // Make sure we have an even number of pages, to match print order of the base
  // ballot sheets (paper paths differ between simplex vs duplex printing).
  if (pageCount % 2) doc.addPage();

  process.nextTick(() => doc.end());

  return doc;
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
