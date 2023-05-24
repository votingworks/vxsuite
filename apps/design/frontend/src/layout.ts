import {
  assert,
  assertDefined,
  iter,
  ok,
  Result,
  wrapException,
} from '@votingworks/basics';
import {
  AnyContest,
  Election,
  getCandidatePartiesDescription,
  getPrecinctById,
  GridLayout,
} from '@votingworks/types';
import makeDebug from 'debug';
import textWrap from 'svg-text-wrap';
import {
  AnyElement,
  Document,
  Page,
  Rectangle,
  TextBox,
} from './document_types';
import { encodeMetadata } from './encode_metadata';

// TODO
// - Text wrapping in contest/candidate names
// - Implement some sort of density control?
// - Make sure can still interpret with diff timing marks

const debug = makeDebug('layout');

const FontWeight = {
  NORMAL: 400,
  SEMIBOLD: 500,
  BOLD: 700,
} as const;

const FontStyles = {
  H1: {
    fontSize: 20,
    fontWeight: FontWeight.BOLD,
    lineHeight: 20,
  },
  H2: {
    fontSize: 16,
    fontWeight: FontWeight.BOLD,
    lineHeight: 16,
  },
  H3: {
    fontSize: 13,
    fontWeight: FontWeight.BOLD,
    lineHeight: 13,
  },
  BODY: {
    fontSize: 10,
    fontWeight: FontWeight.NORMAL,
    lineHeight: 10,
  },
  SMALL: {
    fontSize: 9,
    fontWeight: FontWeight.NORMAL,
    lineHeight: 9,
  },
} as const;

export function range(start: number, end: number): number[] {
  return Array.from({ length: end - start }, (_, i) => i + start);
}

export interface GridDimensions {
  rows: number;
  columns: number;
}

export const PPI = 72;
export const DOCUMENT_WIDTH = 8.5 * PPI;
export const DOCUMENT_HEIGHT = 11 * PPI;

const NUM_CONTEST_COLUMNS = 3;
const GUTTER_WIDTH = 1;
const CONTEST_COLUMN_WIDTH = 10;
export const GRID: GridDimensions = {
  rows: 41,
  columns:
    3 + // Timing marks
    CONTEST_COLUMN_WIDTH * NUM_CONTEST_COLUMNS +
    GUTTER_WIDTH * (NUM_CONTEST_COLUMNS - 1),
};
const HEADER_ROW_HEIGHT = 4.5;
const INSTRUCTIONS_ROW_HEIGHT = 3.5;
const HEADER_AND_INSTRUCTIONS_ROW_HEIGHT =
  HEADER_ROW_HEIGHT + INSTRUCTIONS_ROW_HEIGHT;
const FOOTER_ROW_HEIGHT = 2;
const TIMING_MARKS_ROW_HEIGHT = 1.5; // Includes margin
const CONTENT_AREA_ROW_HEIGHT = GRID.rows - TIMING_MARKS_ROW_HEIGHT * 2 + 1;
const CONTENT_AREA_COLUMN_WIDTH = GRID.columns - 3;

export const COLUMN_GAP = DOCUMENT_WIDTH / (GRID.columns + 1);
export const ROW_GAP = DOCUMENT_HEIGHT / (GRID.rows + 1);

export interface GridPoint {
  row: number;
  column: number;
}
export interface PixelPoint {
  x: number;
  y: number;
}

function gridPosition({ row, column }: GridPoint): PixelPoint {
  return {
    x: column * COLUMN_GAP,
    y: row * ROW_GAP,
  };
}

function gridWidth(gridUnits: number): number {
  return gridUnits * COLUMN_GAP;
}

function gridHeight(gridUnits: number): number {
  return gridUnits * ROW_GAP;
}

function yToRow(y: number): number {
  return y / ROW_GAP;
}

export function Bubble({
  row,
  column,
  isFilled,
}: {
  row: number;
  column: number;
  isFilled: boolean;
}): Rectangle {
  const bubbleWidth = 0.2 * PPI;
  const bubbleHeight = 0.13 * PPI;
  const center = gridPosition({ row, column });
  return {
    type: 'Rectangle',
    x: center.x - bubbleWidth / 2,
    y: center.y - bubbleHeight / 2,
    width: bubbleWidth,
    height: bubbleHeight,
    borderRadius: 0.07 * PPI,
    stroke: 'black',
    strokeWidth: 0.5,
    fill: isFilled ? 'black' : 'none',
  };
}

function TimingMark({
  row,
  column,
}: {
  row: number;
  column: number;
}): Rectangle {
  const markWidth = 0.1875 * PPI;
  const markHeight = 0.0625 * PPI;
  const center = gridPosition({ row, column });
  return {
    type: 'Rectangle',
    x: center.x - markWidth / 2,
    y: center.y - markHeight / 2,
    width: markWidth,
    height: markHeight,
    fill: 'black',
  };
}

export function TimingMarkGrid({
  pageNumber,
}: {
  pageNumber: number;
}): AnyElement {
  // Ballot styles are `card-number-{sheetNumber}`
  const ballotStyleIndex = Math.ceil(pageNumber / 2);
  const sheetMetadata = encodeMetadata(ballotStyleIndex);
  const pageMetadata =
    pageNumber % 2 === 1
      ? sheetMetadata.frontTimingMarks
      : sheetMetadata.backTimingMarks;
  return {
    type: 'Rectangle',
    x: 0,
    y: 0,
    width: DOCUMENT_WIDTH,
    height: DOCUMENT_HEIGHT,
    children: [
      // Top
      range(1, GRID.columns + 1).map((column) =>
        TimingMark({
          row: 1,
          column,
        })
      ),
      // Bottom
      [...pageMetadata.entries()]
        .filter(([, bit]) => bit === 1)
        .map(([column]) =>
          TimingMark({
            row: GRID.rows,
            column: column + 1,
          })
        ),
      // Left
      range(1, GRID.rows + 1).map((row) =>
        TimingMark({
          row,
          column: 1,
        })
      ),
      // Right
      range(1, GRID.rows + 1).map((row) =>
        TimingMark({ row, column: GRID.columns })
      ),
    ].flat(),
  };
}

function HeaderAndInstructions({
  election,
  pageNumber,
}: {
  election: Election;
  pageNumber: number;
}): Rectangle | null {
  if (pageNumber % 2 === 0) {
    return null;
  }

  const header: Rectangle = {
    type: 'Rectangle',
    ...gridPosition({ row: 0, column: 0 }),
    width: gridWidth(CONTENT_AREA_COLUMN_WIDTH),
    height: gridHeight(HEADER_ROW_HEIGHT),
    children: [
      {
        type: 'TextBox',
        ...gridPosition({ row: 0, column: 5.5 }),
        width: gridWidth(CONTENT_AREA_COLUMN_WIDTH - 1),
        height: gridHeight(3),
        textLines: ['Sample Ballot', election.title],
        ...FontStyles.H1,
      },
      {
        type: 'TextBox',
        ...gridPosition({ row: 2.25, column: 5.5 }),
        width: gridWidth(CONTENT_AREA_COLUMN_WIDTH - 1),
        height: gridHeight(5),
        textLines: [
          `${election.county.name}, ${election.state}`,
          Intl.DateTimeFormat('en-US', {
            month: 'long',
            day: 'numeric',
            year: 'numeric',
          }).format(new Date(election.date)),
        ],
        ...FontStyles.H3,
        fontWeight: FontWeight.NORMAL,
      },
      {
        type: 'Image',
        ...gridPosition({ row: 0, column: 0.5 }),
        width: gridWidth(4),
        height: gridHeight(4),
        href: assertDefined(election.sealUrl),
      },
    ],
  };

  const instructions: Rectangle = {
    type: 'Rectangle',
    ...gridPosition({ row: HEADER_ROW_HEIGHT, column: 0 }),
    width: gridWidth(CONTENT_AREA_COLUMN_WIDTH),
    height: gridHeight(INSTRUCTIONS_ROW_HEIGHT),
    stroke: 'black',
    strokeWidth: 0.5,
    fill: '#ededed',
    children: [
      // Thicker top border
      {
        type: 'Rectangle',
        ...gridPosition({ row: 0, column: 0 }),
        width: gridWidth(CONTENT_AREA_COLUMN_WIDTH),
        height: 2,
        fill: 'black',
      },
      {
        type: 'TextBox',
        ...gridPosition({ row: 0.25, column: 0.5 }),
        width: gridWidth(CONTENT_AREA_COLUMN_WIDTH - 1),
        height: gridHeight(INSTRUCTIONS_ROW_HEIGHT - 1),
        textLines: ['Instructions'],
        ...FontStyles.H3,
      },
      {
        type: 'TextBox',
        ...gridPosition({ row: 1.1, column: 0.5 }),
        width: gridWidth(CONTENT_AREA_COLUMN_WIDTH - 1),
        height: gridHeight(INSTRUCTIONS_ROW_HEIGHT - 1),
        textLines: ['To Vote:'],
        ...FontStyles.SMALL,
        fontWeight: FontWeight.BOLD,
      },
      {
        type: 'TextBox',
        ...gridPosition({ row: 1.7, column: 0.5 }),
        width: gridWidth(CONTENT_AREA_COLUMN_WIDTH - 1),
        height: gridHeight(INSTRUCTIONS_ROW_HEIGHT - 1),
        textLines: [
          'To vote, completely fill in',
          'the oval next to your choice.',
        ],
        ...FontStyles.SMALL,
      },
      {
        type: 'Image',
        ...gridPosition({ row: 1.1, column: 7.5 }),
        width: gridWidth(5),
        height: gridHeight(2),
        href: '/images/instructions-fill-oval.svg',
      },
      {
        type: 'TextBox',
        ...gridPosition({ row: 1.1, column: 13.5 }),
        width: gridWidth(CONTENT_AREA_COLUMN_WIDTH - 1),
        height: gridHeight(INSTRUCTIONS_ROW_HEIGHT - 1),
        textLines: ['To Vote for a Write-In:'],
        ...FontStyles.SMALL,
        fontWeight: FontWeight.BOLD,
      },
      {
        type: 'TextBox',
        ...gridPosition({ row: 1.7, column: 13.5 }),
        width: gridWidth(CONTENT_AREA_COLUMN_WIDTH - 1),
        height: gridHeight(INSTRUCTIONS_ROW_HEIGHT - 1),
        textLines: [
          'To vote for a person whose name is not on the',
          'ballot, write the person’s name on the "write-in" line',
          'and completely fill in the oval to the left of the line.',
        ],
        ...FontStyles.SMALL,
      },
      {
        type: 'Image',
        ...gridPosition({ row: 1.1, column: 26.5 }),
        width: gridWidth(5),
        height: gridHeight(1.5),
        href: '/images/instructions-write-in.svg',
      },
    ],
  };

  return {
    type: 'Rectangle',
    ...gridPosition({ row: TIMING_MARKS_ROW_HEIGHT, column: 2 }),
    width: gridWidth(CONTENT_AREA_COLUMN_WIDTH),
    height: gridHeight(HEADER_AND_INSTRUCTIONS_ROW_HEIGHT),
    children: [header, instructions],
  };
}

function Footer({
  election,
  precinctId,
  pageNumber,
  totalPages,
}: {
  election: Election;
  precinctId: string;
  pageNumber: number;
  totalPages: number;
}): Rectangle {
  const continueVoting: AnyElement[] = [
    {
      type: 'TextBox',
      ...gridPosition({ row: 0.5, column: 16.5 }),
      width: gridWidth(CONTENT_AREA_COLUMN_WIDTH - 1),
      height: gridHeight(FOOTER_ROW_HEIGHT - 1),
      textLines: ['Turn ballot over and continue voting'],
      ...FontStyles.H3,
    },
    {
      type: 'Image',
      ...gridPosition({ row: 0.25, column: 30 }),
      width: gridWidth(1.5),
      height: gridHeight(1.5),
      href: '/images/arrow-right-circle.svg',
    },
  ];

  const ballotComplete: AnyElement[] = [
    {
      type: 'TextBox',
      ...gridPosition({ row: 0.5, column: 20 }),
      width: gridWidth(CONTENT_AREA_COLUMN_WIDTH - 1),
      height: gridHeight(FOOTER_ROW_HEIGHT - 1),
      textLines: ['You have completed this ballot.'],
      ...FontStyles.H3,
    },
  ];

  // TODO handle multiple sheets
  const endOfPageInstruction =
    pageNumber === totalPages ? ballotComplete : continueVoting;

  return {
    type: 'Rectangle',
    ...gridPosition({
      row:
        TIMING_MARKS_ROW_HEIGHT + CONTENT_AREA_ROW_HEIGHT - FOOTER_ROW_HEIGHT,
      column: 2,
    }),
    width: gridWidth(CONTENT_AREA_COLUMN_WIDTH),
    height: gridHeight(FOOTER_ROW_HEIGHT),
    fill: '#ededed',
    stroke: 'black',
    strokeWidth: 0.5,
    children: [
      // Thicker top border
      {
        type: 'Rectangle',
        ...gridPosition({ row: 0, column: 0 }),
        width: gridWidth(CONTENT_AREA_COLUMN_WIDTH),
        height: 2,
        fill: 'black',
      },
      {
        type: 'TextBox',
        ...gridPosition({ row: 0.25, column: 0.5 }),
        width: gridWidth(CONTENT_AREA_COLUMN_WIDTH - 1),
        height: gridHeight(FOOTER_ROW_HEIGHT - 1),
        textLines: ['Page'],
        ...FontStyles.SMALL,
      },
      {
        type: 'TextBox',
        ...gridPosition({ row: 0.8, column: 0.5 }),
        width: gridWidth(CONTENT_AREA_COLUMN_WIDTH - 1),
        height: gridHeight(FOOTER_ROW_HEIGHT - 1),
        textLines: [`${pageNumber}/${totalPages}`],
        ...FontStyles.H2,
      },
      {
        type: 'TextBox',
        ...gridPosition({ row: 0.25, column: 3.5 }),
        width: gridWidth(CONTENT_AREA_COLUMN_WIDTH - 1),
        height: gridHeight(FOOTER_ROW_HEIGHT - 1),
        textLines: ['Precinct'],
        ...FontStyles.SMALL,
      },
      {
        type: 'TextBox',
        ...gridPosition({ row: 0.8, column: 3.5 }),
        width: gridWidth(CONTENT_AREA_COLUMN_WIDTH - 1),
        height: gridHeight(FOOTER_ROW_HEIGHT - 1),
        textLines: [
          assertDefined(getPrecinctById({ election, precinctId })).name,
        ],
        ...FontStyles.H2,
      },
      ...endOfPageInstruction,
    ],
  };
}

function Contest({
  election,
  contest,
  row,
}: {
  election: Election;
  contest: AnyContest;
  row: number;
}): Rectangle {
  assert(contest.type === 'candidate');

  const titleLines = textWrap(
    contest.title,
    gridWidth(CONTEST_COLUMN_WIDTH - 0.5)
  );
  const titleTextBox: TextBox = {
    type: 'TextBox',
    ...gridPosition({ row: 0.5, column: 0.5 }),
    width: gridWidth(CONTEST_COLUMN_WIDTH - 1),
    height: gridHeight(titleLines.length),
    textLines: titleLines,
    ...FontStyles.H3,
  };

  const headingRowHeight = 1 + titleLines.length;
  const heading: Rectangle = {
    type: 'Rectangle',
    ...gridPosition({ row: 0, column: 0 }),
    width: gridWidth(CONTEST_COLUMN_WIDTH),
    height: gridHeight(headingRowHeight),
    children: [
      // Thicker top border
      {
        type: 'Rectangle',
        ...gridPosition({ row: 0, column: 0 }),
        width: gridWidth(CONTEST_COLUMN_WIDTH),
        height: 2,
        fill: 'black',
      },
      titleTextBox,
      {
        type: 'TextBox',
        ...gridPosition({ row: 0, column: 0.5 }),
        // TODO: better approach to line spacing
        y:
          titleTextBox.y +
          titleLines.length * FontStyles.H3.lineHeight +
          gridHeight(0.25),
        width: gridWidth(CONTEST_COLUMN_WIDTH - 1),
        height: gridHeight(1),
        textLines: [
          contest.seats === 1
            ? 'Vote for 1'
            : `Vote for not more than ${contest.seats}`,
        ],
        ...FontStyles.BODY,
      },
    ],
  };

  const optionRowHeight = 2;
  const options: Rectangle[] = contest.candidates.map((candidate, index) => ({
    type: 'Rectangle',
    ...gridPosition({
      row: headingRowHeight + index * optionRowHeight,
      column: 0,
    }),
    width: gridWidth(CONTEST_COLUMN_WIDTH),
    height: gridHeight(optionRowHeight),
    // fill: 'rgb(0, 255, 0, 0.2)',
    children: [
      Bubble({ row: 1, column: 1, isFilled: false }),
      {
        type: 'TextBox',
        ...gridPosition({ row: 0.6, column: 1.75 }),
        width: gridWidth(CONTEST_COLUMN_WIDTH - 1),
        height: gridHeight(1),
        textLines: [candidate.name],
        ...FontStyles.BODY,
        fontWeight: FontWeight.BOLD,
      },
      {
        type: 'TextBox',
        ...gridPosition({ row: 1.3, column: 1.75 }),
        width: gridWidth(CONTEST_COLUMN_WIDTH - 1),
        height: gridHeight(1),
        textLines: [getCandidatePartiesDescription(election, candidate)],
        ...FontStyles.BODY,
      },
    ],
  }));

  if (contest.allowWriteIns) {
    const writeInRowHeight = 2;
    const writeInOptions = range(0, contest.seats).map(
      (writeInIndex): Rectangle => ({
        type: 'Rectangle',
        ...gridPosition({
          row:
            headingRowHeight +
            options.length * optionRowHeight +
            writeInIndex * writeInRowHeight,
          column: 0,
        }),
        width: gridWidth(CONTEST_COLUMN_WIDTH),
        height: gridHeight(writeInRowHeight),
        children: [
          Bubble({ row: 1, column: 1, isFilled: false }),
          {
            type: 'Rectangle', // Line?
            ...gridPosition({ row: 1.25, column: 1.75 }),
            width: gridWidth(CONTEST_COLUMN_WIDTH - 2.5),
            height: 1,
            fill: 'black',
          },
          {
            type: 'TextBox',
            ...gridPosition({ row: 1.3, column: 1.75 }),
            width: gridWidth(CONTEST_COLUMN_WIDTH - 2.5),
            height: gridHeight(1),
            textLines: ['write-in'],
            ...FontStyles.SMALL,
          },
        ],
      })
    );
    options.push(...writeInOptions);
  }

  const contestHeight =
    heading.height +
    iter(options)
      .map((option) => option.height)
      .sum() +
    gridHeight(0.5);

  return {
    type: 'Rectangle',
    ...gridPosition({ row, column: 0 }),
    width: gridWidth(CONTEST_COLUMN_WIDTH),
    height: contestHeight,
    stroke: 'black',
    strokeWidth: 0.5,
    children: [heading, ...options],
  };
}

function ThreeColumnContests({
  election,
  contests,
  startRow,
  columnRowHeight,
}: {
  election: Election;
  contests: AnyContest[];
  startRow: number;
  columnRowHeight: number;
}): [Rectangle, AnyContest[]] {
  console.log({ startRow });
  // eslint-disable-next-line @typescript-eslint/no-shadow
  function fillColumn(contests: AnyContest[]): [Rectangle[], AnyContest[]] {
    debug(`Filling column with ${contests.length} possible contests`);
    const CONTEST_ROW_MARGIN = 0.5;
    let heightRemaining = gridHeight(columnRowHeight - CONTEST_ROW_MARGIN * 2);
    let contestIndex = 0;
    const columnContests = [];
    while (heightRemaining > 0 && contestIndex < contests.length) {
      const contest = contests[contestIndex];
      debug(`Attempting to fit contest ${contest.title}`);
      const contestElement = Contest({
        election,
        contest,
        row:
          yToRow(gridHeight(columnRowHeight) - heightRemaining) -
          CONTEST_ROW_MARGIN +
          contestIndex * CONTEST_ROW_MARGIN,
      });
      if (contestElement.height > gridHeight(columnRowHeight)) {
        throw new Error(
          `Contest "${contest.title}" is too tall to fit in one column.`
        );
      }
      if (contestElement.height > heightRemaining) {
        debug('Not enough room for contest, ending column.');
        break;
      }
      debug('Contest fits, adding to column.');
      columnContests.push(contestElement);
      heightRemaining -= contestElement.height;
      contestIndex += 1;
    }
    return [columnContests, contests.slice(contestIndex)];
  }

  const [column1Contests, restContests1] = fillColumn(contests);
  debug('Column 1 contests:', contests.length - restContests1.length);
  const [column2Contests, restContests2] = fillColumn(restContests1);
  debug('Column 2 contests:', restContests1.length - restContests2.length);
  const [column3Contests, restContests3] = fillColumn(restContests2);
  debug('Column 3 contests:', restContests2.length - restContests3.length);

  const contestColumns: Rectangle = {
    type: 'Rectangle',
    ...gridPosition({ row: startRow, column: 2 }),
    width: gridWidth(CONTENT_AREA_COLUMN_WIDTH),
    height: gridHeight(columnRowHeight),
    children: [column1Contests, column2Contests, column3Contests].map(
      (columnContests, columnIndex) => ({
        type: 'Rectangle',
        ...gridPosition({
          row: 0,
          column: (CONTEST_COLUMN_WIDTH + GUTTER_WIDTH) * columnIndex,
        }),
        width: gridWidth(CONTEST_COLUMN_WIDTH),
        height: gridHeight(columnRowHeight),
        // fill: 'rgb(255, 0, 0, 0.2)',
        children: columnContests,
      })
    ),
  };

  return [contestColumns, restContests3];
}

export interface BallotLayout {
  document: Document;
  gridLayouts: GridLayout[];
}

function layOutBallotHelper(
  election: Election,
  precinctId: string,
  districtIds: string[]
) {
  const contests = election.contests.filter((contest) =>
    districtIds.includes(contest.districtId)
  );

  let contestsLeftToLayOut = contests;
  const pages: Page[] = [];
  while (contestsLeftToLayOut.length > 0 && pages.length < 3) {
    const pageNumber = pages.length + 1;
    debug(
      `Laying out page ${pageNumber}, ${contestsLeftToLayOut.length} contests left`
    );
    const headerAndInstructions = HeaderAndInstructions({
      election,
      pageNumber,
    });
    const headerAndInstructionsRowHeight = headerAndInstructions
      ? HEADER_AND_INSTRUCTIONS_ROW_HEIGHT
      : 0;
    const columnRowHeight =
      CONTENT_AREA_ROW_HEIGHT -
      headerAndInstructionsRowHeight -
      (FOOTER_ROW_HEIGHT + 1);
    const [contestColumns, restContests] = ThreeColumnContests({
      election,
      contests: contestsLeftToLayOut,
      columnRowHeight,
      startRow: TIMING_MARKS_ROW_HEIGHT + headerAndInstructionsRowHeight,
    });
    debug(
      `Layed out ${contestsLeftToLayOut.length - restContests.length} contests`
    );
    contestsLeftToLayOut = restContests;
    pages.push({
      children: [
        TimingMarkGrid({ pageNumber }),
        headerAndInstructions,
        contestColumns,
      ].filter((child): child is AnyElement => child !== null),
    });
  }

  // Add footers once we know how many total pages there are.
  for (const [pageNumber, page] of pages.entries()) {
    page.children.push(
      Footer({
        election,
        precinctId,
        pageNumber: pageNumber + 1,
        totalPages: pages.length,
      })
    );
  }

  return {
    document: {
      width: DOCUMENT_WIDTH,
      height: DOCUMENT_HEIGHT,
      pages,
    },
    gridLayouts: [],
  };
}

/**
 * Given an election definition, a precinct, and a list of districts, lays out
 * the contests from those districts on the ballot. Produces a document as well
 * as gridLayouts for the pages of the document.
 *
 * Uses the districts to determine which contests should be on the ballot.
 * Creates one ballot style per ballot card.
 *
 * For now, uses a hardcoded VX layout template, but in the future could be
 * parameterized.
 */
export function layOutBallot(
  election: Election,
  precinctId: string,
  districtIds: string[]
): Result<BallotLayout, Error> {
  try {
    return ok(layOutBallotHelper(election, precinctId, districtIds));
  } catch (e) {
    return wrapException(e);
  }
}
