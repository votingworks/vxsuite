import { assert, assertDefined, iter } from '@votingworks/basics';
import {
  AnyContest,
  Election,
  getCandidatePartiesDescription,
  GridLayout,
} from '@votingworks/types';
import { Document, Rectangle } from './document_types';
import { encodeMetadata } from './encode_metadata';

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
    fontSize: 14,
    fontWeight: FontWeight.BOLD,
    lineHeight: 14,
  },
  BODY: {
    fontSize: 11,
    fontWeight: FontWeight.NORMAL,
    lineHeight: 11,
  },
} as const;

export function range(start: number, end: number): number[] {
  return Array.from({ length: end - start }, (_, i) => i + start);
}

export interface GridDimensions {
  rows: number;
  columns: number;
}

const NUM_CONTEST_COLUMNS = 3;
const GUTTER = 1;

export const GRID: GridDimensions = {
  rows: 41,
  columns: 11 * NUM_CONTEST_COLUMNS + (NUM_CONTEST_COLUMNS - 1) * GUTTER,
};

export const PPI = 72;
export const DOCUMENT_WIDTH = 8.5 * PPI;
export const DOCUMENT_HEIGHT = 11 * PPI;
export const COLUMN_GAP = DOCUMENT_WIDTH / (GRID.columns + 1);
export const ROW_GAP = DOCUMENT_HEIGHT / (GRID.rows + 1);

const HEADER_ROW_HEIGHT = 5;
const FOOTER_ROW_HEIGHT = 3;
const CONTENT_AREA_ROW_HEIGHT = GRID.rows - 3;
const CONTENT_AREA_COLUMN_WIDTH = GRID.columns - 3;

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
  return Math.floor(y / ROW_GAP);
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
    strokeWidth: 1,
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

export function TimingMarkGrid(page: number): Rectangle {
  // Ballot styles are `card-number-{sheetNumber}`
  const ballotStyleIndex = Math.ceil(page / 2);
  const sheetMetadata = encodeMetadata(ballotStyleIndex);
  const pageMetadata =
    page % 2 === 1
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

function Header({ election }: { election: Election }): Rectangle {
  return {
    type: 'Rectangle',
    ...gridPosition({ row: 2, column: 2 }),
    width: gridWidth(CONTENT_AREA_COLUMN_WIDTH),
    height: gridHeight(HEADER_ROW_HEIGHT),
    stroke: 'black',
    children: [
      {
        type: 'TextBox',
        ...gridPosition({ row: 0.5, column: 5 }),
        width: gridWidth(CONTENT_AREA_COLUMN_WIDTH - 1),
        height: gridHeight(3),
        textLines: ['Sample Ballot', election.title],
        ...FontStyles.H1,
      },
      {
        type: 'TextBox',
        ...gridPosition({ row: 2.75, column: 5 }),
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
        ...gridPosition({ row: 0.5, column: 0 }),
        width: gridWidth(5),
        height: gridHeight(4),
        href: assertDefined(election.sealUrl),
      },
    ],
  };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function Footer({ election }: { election: Election }): Rectangle {
  return {
    type: 'Rectangle',
    ...gridPosition({ row: GRID.rows - 4, column: 2 }),
    width: gridWidth(CONTENT_AREA_COLUMN_WIDTH),
    height: gridHeight(FOOTER_ROW_HEIGHT),
    stroke: 'black',
  };
}

function Contest({
  election,
  contest,
  columnWidth,
  row,
}: {
  election: Election;
  contest: AnyContest;
  columnWidth: number;
  row: number;
}): Rectangle {
  assert(contest.type === 'candidate');

  const headingRowHeight = 2;
  const heading: Rectangle = {
    type: 'Rectangle',
    ...gridPosition({ row: 0, column: 0 }),
    width: gridWidth(columnWidth),
    height: gridHeight(headingRowHeight),
    children: [
      {
        type: 'TextBox',
        ...gridPosition({ row: 0.5, column: 0.5 }),
        width: gridWidth(columnWidth - 1),
        height: gridHeight(1),
        textLines: [contest.title],
        ...FontStyles.H3,
      },
      {
        type: 'TextBox',
        ...gridPosition({ row: 1.5, column: 0.5 }),
        width: gridWidth(columnWidth - 1),
        height: gridHeight(1),
        textLines: [`Vote for ${contest.seats}`],
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
    width: gridWidth(columnWidth),
    height: gridHeight(optionRowHeight),
    // fill: 'rgb(0, 255, 0, 0.2)',
    children: [
      Bubble({ row: 1, column: 1, isFilled: false }),
      {
        type: 'TextBox',
        ...gridPosition({ row: 0.6, column: 1.75 }),
        width: gridWidth(columnWidth - 1),
        height: gridHeight(1),
        textLines: [candidate.name],
        ...FontStyles.BODY,
        fontWeight: FontWeight.SEMIBOLD,
      },
      {
        type: 'TextBox',
        ...gridPosition({ row: 1.3, column: 1.75 }),
        width: gridWidth(columnWidth - 1),
        height: gridHeight(1),
        textLines: [getCandidatePartiesDescription(election, candidate)],
        ...FontStyles.BODY,
      },
    ],
  }));

  return {
    type: 'Rectangle',
    ...gridPosition({ row, column: 0 }),
    width: gridWidth(columnWidth),
    height:
      heading.height +
      iter(options)
        .map((option) => option.height)
        .sum() +
      gridHeight(0.5),
    stroke: 'black',
    children: [heading, ...options],
  };
}

function ThreeColumnContests({
  election,
  contests,
}: {
  election: Election;
  contests: AnyContest[];
}): [Rectangle, AnyContest[]] {
  const rowHeight =
    CONTENT_AREA_ROW_HEIGHT - HEADER_ROW_HEIGHT - FOOTER_ROW_HEIGHT - 2;
  const columnWidth =
    (CONTENT_AREA_COLUMN_WIDTH - GUTTER * (NUM_CONTEST_COLUMNS - 1)) /
    NUM_CONTEST_COLUMNS;

  // eslint-disable-next-line @typescript-eslint/no-shadow
  function fillColumn(contests: AnyContest[]): [Rectangle[], AnyContest[]] {
    let heightRemaining = gridHeight(rowHeight);
    let contestIndex = 0;
    const columnContests = [];
    while (heightRemaining > 0 && contestIndex < contests.length) {
      const contest = contests[contestIndex];
      const contestElement = Contest({
        election,
        contest,
        columnWidth,
        row: yToRow(gridHeight(rowHeight) - heightRemaining) + contestIndex,
      });
      if (contestElement.height > heightRemaining) {
        return [columnContests, contests.slice(contestIndex)];
      }
      columnContests.push(contestElement);
      heightRemaining -= contestElement.height;
      contestIndex += 1;
    }
    return [columnContests, []];
  }

  const [column1Contests, restContests1] = fillColumn(contests);
  const [column2Contests, restContests2] = fillColumn(restContests1);
  const [column3Contests, restContests3] = fillColumn(restContests2);

  const contestColumns: Rectangle = {
    type: 'Rectangle',
    ...gridPosition({ row: HEADER_ROW_HEIGHT + 3, column: 2 }),
    width: gridWidth(CONTENT_AREA_COLUMN_WIDTH),
    height: gridHeight(rowHeight),
    children: [column1Contests, column2Contests, column3Contests].map(
      (columnContests, columnIndex) => ({
        type: 'Rectangle',
        ...gridPosition({
          row: 0,
          column: (columnWidth + GUTTER) * columnIndex,
        }),
        width: gridWidth(columnWidth),
        height: gridHeight(rowHeight),
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
): BallotLayout {
  const contests = election.contests.filter((contest) =>
    districtIds.includes(contest.districtId)
  );

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [contestColumns, restContests] = ThreeColumnContests({
    election,
    contests,
  });

  return {
    document: {
      width: DOCUMENT_WIDTH,
      height: DOCUMENT_HEIGHT,
      pages: [
        {
          children: [
            TimingMarkGrid(1),
            Header({ election }),
            contestColumns,
            Footer({ election }),
          ],
        },
      ],
    },
    gridLayouts: [],
  };
}
