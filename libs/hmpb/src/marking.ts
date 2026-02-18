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
  Candidate,
  CandidateContest,
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
import { voteMatchesGridPosition } from './vote_matching';

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
 * If {@link baseBallotPdf} is specified, the marks will be composited on top
 * of the base ballot PDF. Otherwise, a new PDF with just the marks is created.
 *
 * Intended for printing over pre-printed HMPBs or for bubble ballot marking.
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

  // Load base ballot PDF or create a new document
  const doc = baseBallotPdf
    ? await PDFDocument.load(baseBallotPdf)
    : await PDFDocument.create();

  if (baseBallotPdf) {
    const basePageSize = doc.getPage(0).getSize();
    assert(
      basePageSize.width === pageSize[0] && basePageSize.height === pageSize[1],
      `base PDF size ([${basePageSize.width},${basePageSize.height}]) does ` +
        `not match expected (${pageSize})`
    );
  }

  doc.registerFontkit(fontKit);
  const fontRobotoBold = await doc.embedFont(robotoBoldTtf);

  for (const pos of layout.gridPositions) {
    let pageNumber = pos.sheetNumber * 2;
    if (pos.side === 'front') pageNumber -= 1;

    // Create pages if they don't exist (for non-base ballot case)
    if (!baseBallotPdf) {
      while (doc.getPageCount() < pageNumber) {
        const page = doc.addPage();
        page.setSize(pageSize[0], pageSize[1]);
      }
    }

    const contestVotes = votes[pos.contestId];
    if (!contestVotes) continue;

    const contest = election.contests.find((c) => c.id === pos.contestId);
    assert(contest, `contest ${pos.contestId} not found`);
    // TODO: Handle straight-party marking in a later commit
    if (contest.type === 'straight-party') continue;

    const mark = markInfo(contestVotes, pos, contest, layout);
    if (!mark) continue;

    const page = doc.getPage(pageNumber - 1);

    const bubbleCenter = [
      gridOrigin[0] + gridSize[0] * (pos.column / (timingMarkCount.x - 1)),
      gridOrigin[1] + gridSize[1] * (pos.row / (timingMarkCount.y - 1)),
    ];

    // Draw bubble mark using pdf-lib
    bubbleMark(page, [
      bubbleCenter[0] - markSizeHalf[0],
      pageSize[1] - bubbleCenter[1] + markSizeHalf[1],
    ]);

    if (!mark.writeInName) continue;

    // Add write-in candidate name within the configured search area
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
    if (fontRobotoBold.widthOfTextAtSize(name, fontSize) > areaSize[0]) {
      fontSize = writeInFontSizeReduced;
    }

    origin[1] += 0.5 * (areaSize[1] - fontSize);

    page.drawText(name, {
      font: fontRobotoBold,
      size: fontSize,
      x: origin[0],
      y: pageSize[1] - origin[1] - fontSize,
    });
  }

  // Make sure we have an even number of pages, to match print order of the base
  // ballot sheets (paper paths differ between simplex vs duplex printing).
  if (doc.getPageCount() % 2) doc.addPage().setSize(pageSize[0], pageSize[1]);

  return doc.save();
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
 */
function bubbleMark(page: PDFPage, originTopLeft: [number, number]): void {
  const radius = markBorderRadius;
  const p1: [number, number] = [originTopLeft[0] + radius, originTopLeft[1]];
  const p2: [number, number] = [p1[0] + markLenTop, p1[1]];

  page.pushOperators(setFillingGrayscaleColor(0), moveTo(...p1), lineTo(...p2));

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

  [p1[0], p1[1]] = p2;
  p2[0] -= markLenBottom;
  page.pushOperators(lineTo(...p2));

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

  page.pushOperators(fill());
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
  contest: CandidateContest | { type: 'yesno'; id: string },
  layout: { gridPositions: readonly GridPosition[] }
): MarkInfo | null {
  for (const vote of votes) {
    // Handle yes/no votes
    if (contest.type === 'yesno') {
      assert(gridPos.type === 'option');
      if (vote === gridPos.optionId) return {};
      continue;
    }
    // For candidate contests only
    assert(contest.type === 'candidate');
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

    if (voteMatchesGridPosition(candidateVote, gridPos, layout.gridPositions)) {
      return {};
    }
  }

  return null;
}
