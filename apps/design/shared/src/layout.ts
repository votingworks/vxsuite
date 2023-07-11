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
  BallotStyle,
  Contests,
  Election,
  getCandidatePartiesDescription,
  getContests,
  GridLayout,
  GridPosition,
  Precinct,
} from '@votingworks/types';
import makeDebug from 'debug';
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

const FontWeights = {
  NORMAL: 400,
  SEMIBOLD: 500,
  BOLD: 700,
} as const;

type FontWeight = typeof FontWeights[keyof typeof FontWeights];

interface FontStyle {
  fontSize: number;
  fontWeight: FontWeight;
  lineHeight: number;
}

const FontStyles = {
  H1: {
    fontSize: 20,
    fontWeight: FontWeights.BOLD,
    lineHeight: 20,
  },
  H2: {
    fontSize: 16,
    fontWeight: FontWeights.BOLD,
    lineHeight: 16,
  },
  H3: {
    fontSize: 13,
    fontWeight: FontWeights.BOLD,
    lineHeight: 13,
  },
  BODY: {
    fontSize: 10,
    fontWeight: FontWeights.NORMAL,
    lineHeight: 10,
  },
  SMALL: {
    fontSize: 9,
    fontWeight: FontWeights.NORMAL,
    lineHeight: 9,
  },
} as const;

export function range(start: number, end: number): number[] {
  return Array.from({ length: end - start }, (_, i) => i + start);
}

// TODO more accurate text measurement
function characterWidth(character: string, fontStyle: FontStyle): number {
  return fontStyle.fontSize * 0.5;
}

function textWidth(text: string, fontStyle: FontStyle): number {
  return iter(text.split('').map((c) => characterWidth(c, fontStyle))).sum();
}

function textWrap(text: string, fontStyle: FontStyle, width: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';
  for (const word of words) {
    const extendedLine = [currentLine, word].join(' ');
    if (textWidth(extendedLine, fontStyle) <= width) {
      currentLine = extendedLine;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  }
  lines.push(currentLine);
  return lines;
}

export interface GridDimensions {
  rows: number;
  columns: number;
}

export const PPI = 72;
export const DOCUMENT_WIDTH = 8.5 * PPI;
export const DOCUMENT_HEIGHT = 11 * PPI;

export const GRID: GridDimensions = {
  rows: 41,
  columns: 34,
};
const HEADER_ROW_HEIGHT = 4.5;
const INSTRUCTIONS_ROW_HEIGHT = 3.5;
const HEADER_AND_INSTRUCTIONS_ROW_HEIGHT =
  HEADER_ROW_HEIGHT + INSTRUCTIONS_ROW_HEIGHT;
const FOOTER_ROW_HEIGHT = 2;
const TIMING_MARKS_ROW_HEIGHT = 1.5; // Includes margin
const CONTENT_AREA_ROW_HEIGHT = GRID.rows - TIMING_MARKS_ROW_HEIGHT * 2 + 1;
const CONTENT_AREA_COLUMN_WIDTH = GRID.columns - 3;
const GUTTER_WIDTH = 0.5;
const CONTEST_COLUMN_WIDTH = 9.5;
const MAX_CONTEST_ROW_HEIGHT =
  CONTENT_AREA_ROW_HEIGHT - (FOOTER_ROW_HEIGHT + 1);

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

export function gridPosition({ row, column }: GridPoint): PixelPoint {
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
  return Math.round((y / ROW_GAP) * 10) / 10;
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
  ballotStyleIndex,
  precinctIndex,
}: {
  pageNumber: number;
  ballotStyleIndex: number;
  precinctIndex: number;
}): AnyElement {
  const sheetMetadata = encodeMetadata(ballotStyleIndex, precinctIndex);
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
        fontWeight: FontWeights.NORMAL,
      },
      {
        type: 'Image',
        ...gridPosition({ row: 0, column: 0.5 }),
        width: gridWidth(4),
        height: gridHeight(4),
        href: election.sealUrl ?? '/seals/state-of-hamilton-official-seal.svg',
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
        fontWeight: FontWeights.BOLD,
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
        ...gridPosition({ row: 1.1, column: 13 }),
        width: gridWidth(CONTENT_AREA_COLUMN_WIDTH - 1),
        height: gridHeight(INSTRUCTIONS_ROW_HEIGHT - 1),
        textLines: ['To Vote for a Write-In:'],
        ...FontStyles.SMALL,
        fontWeight: FontWeights.BOLD,
      },
      {
        type: 'TextBox',
        ...gridPosition({ row: 1.7, column: 13 }),
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
        ...gridPosition({ row: 1.1, column: 25.5 }),
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
  precinct,
  pageNumber,
  totalPages,
}: {
  precinct: Precinct;
  pageNumber: number;
  totalPages: number;
}): Rectangle {
  const continueVoting: AnyElement[] = [
    {
      type: 'TextBox',
      ...gridPosition({ row: 0.5, column: 16 }),
      width: gridWidth(CONTENT_AREA_COLUMN_WIDTH - 1),
      height: gridHeight(FOOTER_ROW_HEIGHT - 1),
      textLines: ['Turn ballot over and continue voting'],
      ...FontStyles.H3,
    },
    {
      type: 'Image',
      ...gridPosition({ row: 0.25, column: 29 }),
      width: gridWidth(1.5),
      height: gridHeight(1.5),
      href: '/images/arrow-right-circle.svg',
    },
  ];

  const ballotComplete: AnyElement[] = [
    {
      type: 'TextBox',
      ...gridPosition({ row: 0.5, column: 19.5 }),
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
        textLines: [precinct.name],
        ...FontStyles.H2,
      },
      ...endOfPageInstruction,
    ],
  };
}

function CandidateContest({
  election,
  contest,
  row,
  gridRow,
  gridColumn,
  pageNumber,
}: {
  election: Election;
  contest: AnyContest;
  row: number;
  gridRow: number;
  gridColumn: number;
  pageNumber: number;
}): [Rectangle, GridPosition[]] {
  assert(contest.type === 'candidate');

  // Temp hack until we can change the timing mark grid dimensions: expand the
  // last contest column to fill the page
  const width =
    gridColumn > 20
      ? CONTENT_AREA_COLUMN_WIDTH - 2 * (CONTEST_COLUMN_WIDTH + GUTTER_WIDTH)
      : CONTEST_COLUMN_WIDTH;
  const titleLines = textWrap(
    contest.title,
    FontStyles.H3,
    gridWidth(width - 0.5)
  );
  const titleTextBox: TextBox = {
    type: 'TextBox',
    ...gridPosition({ row: 0.5, column: 0.5 }),
    width: gridWidth(width - 1),
    height: gridHeight(titleLines.length),
    textLines: titleLines,
    ...FontStyles.H3,
  };

  const headingRowHeight = 1 + titleLines.length;
  const heading: Rectangle = {
    type: 'Rectangle',
    ...gridPosition({ row: 0, column: 0 }),
    width: gridWidth(width),
    height: gridHeight(headingRowHeight),
    children: [
      // Thicker top border
      {
        type: 'Rectangle',
        ...gridPosition({ row: 0, column: 0 }),
        width: gridWidth(width),
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
        width: gridWidth(width - 1),
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

  const optionPostions: GridPosition[] = [];
  const side = pageNumber % 2 === 1 ? 'front' : 'back';

  const optionRowHeight = 2;
  const options: Rectangle[] = [];
  for (const [index, candidate] of contest.candidates.entries()) {
    const optionRow = headingRowHeight + index * optionRowHeight;
    options.push({
      type: 'Rectangle',
      ...gridPosition({
        row: optionRow,
        column: 0,
      }),
      width: gridWidth(width),
      height: gridHeight(optionRowHeight),
      // fill: 'rgb(0, 255, 0, 0.2)',
      children: [
        Bubble({ row: 1, column: 1, isFilled: false }),
        {
          type: 'TextBox',
          ...gridPosition({ row: 0.6, column: 1.75 }),
          width: gridWidth(width - 1),
          height: gridHeight(1),
          textLines: [candidate.name],
          ...FontStyles.BODY,
          fontWeight: FontWeights.BOLD,
        },
        {
          type: 'TextBox',
          ...gridPosition({ row: 1.3, column: 1.75 }),
          width: gridWidth(width - 1),
          height: gridHeight(1),
          textLines: [getCandidatePartiesDescription(election, candidate)],
          ...FontStyles.BODY,
        },
      ],
    });

    optionPostions.push({
      type: 'option',
      side,
      contestId: contest.id,
      column: gridColumn,
      row: gridRow + optionRow,
      optionId: candidate.id,
    });
  }

  if (contest.allowWriteIns) {
    const optionsHeight = options.length * optionRowHeight;
    const writeInRowHeight = 2;
    for (const writeInIndex of range(0, contest.seats)) {
      const optionRow =
        headingRowHeight + optionsHeight + writeInIndex * writeInRowHeight;
      options.push({
        type: 'Rectangle',
        ...gridPosition({
          row: optionRow,
          column: 0,
        }),
        width: gridWidth(width),
        height: gridHeight(writeInRowHeight),
        children: [
          Bubble({ row: 1, column: 1, isFilled: false }),
          {
            type: 'Rectangle', // Line?
            ...gridPosition({ row: 1.25, column: 1.75 }),
            width: gridWidth(width - 2.5),
            height: 1,
            fill: 'black',
          },
          {
            type: 'TextBox',
            ...gridPosition({ row: 1.3, column: 1.75 }),
            width: gridWidth(width - 2.5),
            height: gridHeight(1),
            textLines: ['write-in'],
            ...FontStyles.SMALL,
          },
        ],
      });

      optionPostions.push({
        type: 'write-in',
        side,
        contestId: contest.id,
        column: gridColumn,
        row: gridRow + optionRow,
        writeInIndex,
      });
    }
  }

  const contestHeight =
    heading.height +
    iter(options)
      .map((option) => option.height)
      .sum() +
    gridHeight(0.5);

  return [
    {
      type: 'Rectangle',
      ...gridPosition({ row, column: 0 }),
      width: gridWidth(width),
      height: contestHeight,
      stroke: 'black',
      strokeWidth: 0.5,
      children: [heading, ...options],
    },
    optionPostions,
  ];
}

function BallotMeasure({
  contest,
  row,
  gridRow,
  gridColumn,
  pageNumber,
}: {
  election: Election;
  contest: AnyContest;
  row: number;
  gridRow: number;
  gridColumn: number;
  pageNumber: number;
}): [Rectangle, GridPosition[]] {
  assert(contest.type === 'yesno');

  // Temp hack until we can change the timing mark grid dimensions: expand the
  // last contest column to fill the page
  const width = CONTENT_AREA_COLUMN_WIDTH;
  const titleLines = textWrap(
    contest.title,
    FontStyles.H3,
    gridWidth(width - 0.5)
  );
  const titleTextBox: TextBox = {
    type: 'TextBox',
    ...gridPosition({ row: 0.5, column: 0.5 }),
    width: gridWidth(width - 1),
    height: gridHeight(titleLines.length),
    textLines: titleLines,
    ...FontStyles.H3,
  };

  const descriptionLines = textWrap(
    contest.description,
    FontStyles.BODY,
    gridWidth(width)
  );

  const headingRowHeight =
    titleLines.length +
    yToRow(descriptionLines.length * FontStyles.BODY.lineHeight) +
    0.5;
  const heading: Rectangle = {
    type: 'Rectangle',
    ...gridPosition({ row: 0, column: 0 }),
    width: gridWidth(width),
    height: gridHeight(headingRowHeight),
    children: [
      // Thicker top border
      {
        type: 'Rectangle',
        ...gridPosition({ row: 0, column: 0 }),
        width: gridWidth(width),
        height: 2,
        fill: 'black',
      },
      titleTextBox,
      {
        type: 'TextBox',
        // y coord will be set below
        ...gridPosition({ row: 0, column: 0.5 }),
        y:
          titleTextBox.y +
          titleLines.length * FontStyles.H3.lineHeight +
          gridHeight(0.25),
        width: gridWidth(width - 1),
        // TODO: better support for text height with descenders
        height: descriptionLines.length * FontStyles.BODY.lineHeight + 5,
        textLines: descriptionLines,
        ...FontStyles.BODY,
      },
    ],
  };

  const optionPostions: GridPosition[] = [];
  const side = pageNumber % 2 === 1 ? 'front' : 'back';

  const choices = [
    { id: 'yes', label: 'Yes' },
    { id: 'no', label: 'No' },
  ];

  const optionRowHeight = 1;
  const options: Rectangle[] = [];
  for (const [index, choice] of choices.entries()) {
    const optionRow = headingRowHeight + index * optionRowHeight;
    options.push({
      type: 'Rectangle',
      ...gridPosition({
        row: optionRow,
        column: 0,
      }),
      width: gridWidth(width),
      height: gridHeight(optionRowHeight),
      // fill: 'rgb(0, 255, 0, 0.2)',
      children: [
        Bubble({ row: 1, column: 1, isFilled: false }),
        {
          type: 'TextBox',
          ...gridPosition({ row: 0.65, column: 1.75 }),
          width: gridWidth(width - 1),
          height: gridHeight(1),
          textLines: [choice.label],
          ...FontStyles.BODY,
          fontWeight: FontWeights.BOLD,
        },
      ],
    });

    optionPostions.push({
      type: 'option',
      side,
      contestId: contest.id,
      column: gridColumn,
      row: gridRow + optionRow,
      optionId: choice.id,
    });
  }

  const contestHeight =
    heading.height +
    iter(options)
      .map((option) => option.height)
      .sum() +
    gridHeight(1);

  return [
    {
      type: 'Rectangle',
      ...gridPosition({ row, column: 0 }),
      width: gridWidth(width),
      height: contestHeight,
      stroke: 'black',
      strokeWidth: 0.5,
      children: [heading, ...options],
    },
    optionPostions,
  ];
}

function ThreeColumnContests({
  election,
  contests,
  gridRow,
  gridColumn,
  heightAvailable,
  pageNumber,
}: {
  election: Election;
  contests: Contests;
  gridColumn: number;
  gridRow: number;
  heightAvailable: number;
  pageNumber: number;
}): [Rectangle, AnyContest[], GridPosition[]] {
  function fillColumn(
    // eslint-disable-next-line @typescript-eslint/no-shadow
    contests: Contests,
    // eslint-disable-next-line @typescript-eslint/no-shadow
    gridColumn: number
  ): [Rectangle[], AnyContest[], GridPosition[]] {
    const contestPositions: GridPosition[] = [];
    debug(`Filling column with ${contests.length} possible contests`);
    const CONTEST_ROW_MARGIN = 0.5;
    const maxHeight = gridHeight(heightAvailable - CONTEST_ROW_MARGIN * 2);
    let heightUsed = 0;
    let contestIndex = 0;
    const columnContests = [];
    while (heightUsed < maxHeight && contestIndex < contests.length) {
      const contest = contests[contestIndex];
      debug(`Attempting to fit contest ${contest.title}`);
      const row = yToRow(heightUsed) + (contestIndex + 1) * CONTEST_ROW_MARGIN;
      const [contestElement, optionPostions] = CandidateContest({
        election,
        contest,
        row,
        gridRow: gridRow + row,
        gridColumn,
        pageNumber,
      });
      if (contestElement.height > gridHeight(MAX_CONTEST_ROW_HEIGHT)) {
        throw new Error(
          `Contest "${contest.title}" is too tall to fit on page.`
        );
      }
      if (heightUsed + contestElement.height > maxHeight) {
        debug('Not enough room for contest, ending column.');
        break;
      }
      debug('Contest fits, adding to column.');
      columnContests.push(contestElement);
      heightUsed += contestElement.height;
      contestIndex += 1;

      contestPositions.push(...optionPostions);
    }
    return [columnContests, contests.slice(contestIndex), contestPositions];
  }

  const [column1Contests, restContests1, column1Positions] = fillColumn(
    contests,
    gridColumn
  );
  debug('Column 1 contests:', contests.length - restContests1.length);
  const [column2Contests, restContests2, column2Positions] = fillColumn(
    restContests1,
    gridColumn + CONTEST_COLUMN_WIDTH + GUTTER_WIDTH
  );
  debug('Column 2 contests:', restContests1.length - restContests2.length);
  const [column3Contests, restContests3, column3Positions] = fillColumn(
    restContests2,
    gridColumn + (CONTEST_COLUMN_WIDTH + GUTTER_WIDTH) * 2
  );
  debug('Column 3 contests:', restContests2.length - restContests3.length);

  const contestColumns: Rectangle = {
    type: 'Rectangle',
    ...gridPosition({ row: gridRow, column: 2 }),
    width: gridWidth(CONTENT_AREA_COLUMN_WIDTH),
    height: gridHeight(heightAvailable),
    children: [column1Contests, column2Contests, column3Contests].map(
      (columnContests, columnIndex) => ({
        type: 'Rectangle',
        ...gridPosition({
          row: 0,
          column: (CONTEST_COLUMN_WIDTH + GUTTER_WIDTH) * columnIndex,
        }),
        width: gridWidth(CONTEST_COLUMN_WIDTH),
        height: gridHeight(heightAvailable),
        // fill: 'rgb(255, 0, 0, 0.2)',
        children: columnContests,
      })
    ),
  };

  return [
    contestColumns,
    restContests3,
    [...column1Positions, ...column2Positions, ...column3Positions],
  ];
}

function SingleColumnContests({
  election,
  contests,
  gridRow,
  gridColumn,
  heightAvailable,
  pageNumber,
}: {
  election: Election;
  contests: Contests;
  gridColumn: number;
  gridRow: number;
  heightAvailable: number;
  pageNumber: number;
}): [Rectangle, AnyContest[], GridPosition[]] {
  const contestPositions: GridPosition[] = [];
  debug(`Filling single column with ${contests.length} possible contests`);
  const CONTEST_ROW_MARGIN = 0.5;
  const maxHeight = gridHeight(heightAvailable - CONTEST_ROW_MARGIN * 2);
  let heightUsed = 0;
  let contestIndex = 0;
  const columnContests = [];
  while (heightUsed < maxHeight && contestIndex < contests.length) {
    const contest = contests[contestIndex];
    debug(`Attempting to fit contest ${contest.title}`);
    const row = yToRow(heightUsed) + (contestIndex + 1) * CONTEST_ROW_MARGIN;
    const [contestElement, optionPostions] = BallotMeasure({
      election,
      contest,
      row,
      gridRow: gridRow + row,
      gridColumn,
      pageNumber,
    });
    if (contestElement.height > gridHeight(MAX_CONTEST_ROW_HEIGHT)) {
      throw new Error(`Contest "${contest.title}" is too tall to fit on page.`);
    }
    if (heightUsed + contestElement.height > maxHeight) {
      debug('Not enough room for contest, ending single column.');
      break;
    }
    debug('Contest fits, adding to single column.');
    columnContests.push(contestElement);
    heightUsed += contestElement.height;
    contestIndex += 1;

    contestPositions.push(...optionPostions);
  }

  const contestColumn: Rectangle = {
    type: 'Rectangle',
    ...gridPosition({ row: gridRow, column: 2 }),
    width: gridWidth(CONTENT_AREA_COLUMN_WIDTH),
    height: gridHeight(heightAvailable),
    children: columnContests,
  };
  return [contestColumn, contests.slice(contestIndex), contestPositions];
}

export interface BallotLayout {
  document: Document;
  gridLayout: GridLayout;
}

function layOutBallotHelper(
  election: Election,
  precinct: Precinct,
  ballotStyle: BallotStyle
) {
  const ballotStyleIndex = election.ballotStyles.findIndex(
    (bs) => bs.id === ballotStyle.id
  );
  const precinctIndex = election.precincts.findIndex(
    (p) => p.id === precinct.id
  );
  // For now, just one section for candidate contests, one for ballot measures.
  // TODO support arbitrarily defined sections
  const contestSections: Array<AnyContest[]> = iter(
    getContests({ election, ballotStyle })
  )
    .partition((contest) => contest.type === 'candidate')
    .filter((section) => section.length > 0);

  let contestSectionsLeftToLayOut = contestSections;
  const pages: Page[] = [];
  const gridPositions: GridPosition[] = [];
  while (contestSectionsLeftToLayOut.length > 0) {
    const pageNumber = pages.length + 1;
    debug(
      `Laying out page ${pageNumber}, ${contestSectionsLeftToLayOut.length} contest sections left`
    );
    const headerAndInstructions = HeaderAndInstructions({
      election,
      pageNumber,
    });
    const headerAndInstructionsRowHeight = headerAndInstructions
      ? HEADER_AND_INSTRUCTIONS_ROW_HEIGHT
      : 0;
    const contestsRowHeight =
      CONTENT_AREA_ROW_HEIGHT -
      headerAndInstructionsRowHeight -
      (FOOTER_ROW_HEIGHT + 1);

    let heightUsed = 0;
    const contestObjects: Rectangle[] = [];
    while (
      heightUsed < gridHeight(contestsRowHeight) &&
      contestSectionsLeftToLayOut.length > 0
    ) {
      const contestSection = assertDefined(contestSectionsLeftToLayOut.shift());
      const ContestsComponent =
        contestSection[0].type === 'candidate'
          ? ThreeColumnContests
          : SingleColumnContests;
      const [contestColumns, restContests, contestPositions] =
        ContestsComponent({
          election,
          contests: contestSection,
          heightAvailable: contestsRowHeight,
          gridRow: TIMING_MARKS_ROW_HEIGHT + headerAndInstructionsRowHeight,
          gridColumn: 2,
          pageNumber,
        });
      if (restContests.length > 0) {
        contestSectionsLeftToLayOut = [
          restContests,
          ...contestSectionsLeftToLayOut,
        ];
      }
      debug(
        `Layed out ${contestSection.length - restContests.length} contests`
      );
      contestObjects.push(contestColumns);
      heightUsed += contestColumns.height;
      gridPositions.push(...contestPositions);
    }

    pages.push({
      children: [
        TimingMarkGrid({ pageNumber, ballotStyleIndex, precinctIndex }),
        headerAndInstructions,
        ...contestObjects,
      ].filter((child): child is AnyElement => child !== null),
    });
  }

  // Add footers once we know how many total pages there are.
  for (const [pageIndex, page] of pages.entries()) {
    page.children.push(
      Footer({
        precinct,
        pageNumber: pageIndex + 1,
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
    gridLayout: {
      precinctId: precinct.id,
      ballotStyleId: ballotStyle.id,
      columns: GRID.columns,
      rows: GRID.rows,
      optionBoundsFromTargetMark: {
        bottom: 1,
        left: 1,
        right: 9,
        top: 2,
      },
      gridPositions,
    },
  };
}

/**
 * Given an election definition, a precinct, and a ballot style, lays out the
 * contests for the ballot style on a ballot. Produces a document as well as
 * gridLayouts for the pages of the document.
 *
 * For now, uses a hardcoded VX layout template, but in the future could be
 * parameterized.
 */
export function layOutBallot(
  election: Election,
  precinct: Precinct,
  ballotStyle: BallotStyle
): Result<BallotLayout, Error> {
  try {
    return ok(layOutBallotHelper(election, precinct, ballotStyle));
  } catch (e) {
    return wrapException(e);
  }
}
