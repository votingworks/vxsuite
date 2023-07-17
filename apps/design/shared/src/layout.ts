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
const CONTEST_ROW_MARGIN = 0.5;
const MAX_CONTEST_ROW_HEIGHT =
  CONTENT_AREA_ROW_HEIGHT - CONTEST_ROW_MARGIN * 2 - FOOTER_ROW_HEIGHT;

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
  const isFront = pageNumber % 2 === 1;
  const continueVoting: AnyElement[] = [
    {
      type: 'TextBox',
      ...gridPosition({ row: 0.5, column: isFront ? 16 : 18 }),
      width: gridWidth(CONTENT_AREA_COLUMN_WIDTH - 1),
      height: gridHeight(FOOTER_ROW_HEIGHT - 1),
      textLines: [
        isFront
          ? 'Turn ballot over and continue voting'
          : 'Continue voting on next ballot',
      ],
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
      ...gridPosition({ row: 0.5, column: 20.5 }),
      width: gridWidth(CONTENT_AREA_COLUMN_WIDTH - 1),
      height: gridHeight(FOOTER_ROW_HEIGHT - 1),
      textLines: ['You have completed voting.'],
      ...FontStyles.H3,
    },
  ];

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
          // TODO wrap candidate.name
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
    Math.ceil(yToRow(descriptionLines.length * FontStyles.BODY.lineHeight));
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
    gridHeight(1.5);

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

function findLastIndex<T>(arr: T[], keyFn: (item: T) => boolean): number {
  for (let i = arr.length - 1; i >= 0; i -= 1) {
    if (keyFn(arr[i])) {
      return i;
    }
  }
  return -1;
}

/**
 * Builds a comparator that compares two items by multiple scoring functions.
 * If the first scoring function returns a tie, uses the second scoring function
 * as a tiebreaker, and so on.
 */
function compareByScores<T>(scoringFns: Array<(item: T) => number>) {
  return (a: T, b: T): number => {
    for (const scoringFn of scoringFns) {
      const diff = scoringFn(a) - scoringFn(b);
      if (diff !== 0) {
        return diff;
      }
    }
    return 0;
  };
}

interface ElementWithHeight {
  height: number;
}

type Column<Element extends ElementWithHeight> = Element[];

/**
 * Lay out elements with fixed heights in columns, with the following constraints:
 * - No more than `numColumns` columns
 * - Each column must be no taller than `maxColumnHeight`
 * - Element order must be preserved when filling columns
 * - If not all of the elements fit, fit as many as possible and then return the
 * leftover elements
 * - If all of the elements fit, try to shorten the columns as much as possible
 * - If there are multiple ways to shorten the columns, choose the one that
 * looks the most balanced
 */
export function layOutInColumns<Element extends ElementWithHeight>({
  elements,
  numColumns,
  maxColumnHeight,
}: {
  elements: Element[];
  numColumns: number;
  maxColumnHeight: number;
}): {
  columns: Array<Column<Element>>;
  height: number;
  leftoverElements: Element[];
} {
  function emptyColumns(): Array<Column<Element>> {
    return range(0, numColumns).map(() => []);
  }

  function columnHeight(column: Column<Element>): number {
    return iter(column)
      .map((e) => e.height)
      .sum();
  }

  function isColumnOverflowing(column: Column<Element>): boolean {
    return columnHeight(column) > maxColumnHeight;
  }

  function heightOfTallestColumn(columns: Array<Column<Element>>): number {
    return Math.max(...columns.map((column) => columnHeight(column)));
  }

  // First, try a greedy approach of filling columns to the max height
  const greedyColumns: Array<Column<Element>> = emptyColumns();
  let currentColumnIndex = 0;
  let elementIndex = 0;
  while (elementIndex < elements.length && currentColumnIndex < numColumns) {
    const element = elements[elementIndex];
    if (
      isColumnOverflowing(greedyColumns[currentColumnIndex].concat([element]))
    ) {
      currentColumnIndex += 1;
    } else {
      greedyColumns[currentColumnIndex].push(element);
      elementIndex += 1;
    }
  }
  const leftoverElements = elements.slice(elementIndex);

  // If the greedy approach didn't use up all the elements, then we won't be
  // able to shorten the columns, so we're done.
  if (leftoverElements.length > 0) {
    return {
      columns: greedyColumns,
      height: heightOfTallestColumn(greedyColumns),
      leftoverElements,
    };
  }

  // Otherwise, let's try to shorten the columns as much as possible while still
  // fitting all the elements.

  // Recursively generates all possible ways to fill the columns with the given elements
  function possibleColumns(
    columnsSoFar: Array<Column<Element>>,
    elementsLeft: Element[]
  ): Array<Array<Column<Element>>> {
    if (elementsLeft.length === 0) {
      return [columnsSoFar];
    }

    const [nextElement, ...restElements] = elementsLeft;

    const results: Array<Array<Column<Element>>> = [];

    // If there's a current column being filled, try adding the next element to it
    const lastNonEmptyColumnIndex = findLastIndex(
      columnsSoFar,
      (column) => column.length > 0
    );
    if (lastNonEmptyColumnIndex !== -1) {
      const newColumns = [...columnsSoFar];
      newColumns[lastNonEmptyColumnIndex] = [
        ...newColumns[lastNonEmptyColumnIndex],
        nextElement,
      ];
      if (!isColumnOverflowing(newColumns[lastNonEmptyColumnIndex])) {
        results.push(...possibleColumns(newColumns, restElements));
      }
    }

    // Also try adding the next element to a new column
    const firstEmptyColumnIndex = columnsSoFar.findIndex(
      (column) => column.length === 0
    );
    if (firstEmptyColumnIndex !== -1) {
      const newColumns = [...columnsSoFar];
      newColumns[firstEmptyColumnIndex] = [nextElement];
      if (!isColumnOverflowing(newColumns[firstEmptyColumnIndex])) {
        results.push(...possibleColumns(newColumns, restElements));
      }
    }

    return results;
  }

  const allPossibleColumns = possibleColumns(emptyColumns(), elements);
  assert(allPossibleColumns.length > 0);

  function spread(numbers: number[]): number {
    return Math.max(...numbers) - Math.min(...numbers);
  }
  const bestColumns = assertDefined(
    iter(allPossibleColumns).min(
      compareByScores([
        // Shortest overall height
        (columns) => heightOfTallestColumn(columns),
        // Least difference in height among columns
        (columns) => spread(columns.map((c) => columnHeight(c))),
        // Least gaps (empty columns in the middle)
        (columns) => {
          return columns.findIndex((column) => column.length === 0);
        },
      ])
    )
  );
  return {
    columns: bestColumns,
    height: heightOfTallestColumn(bestColumns),
    leftoverElements: [],
  };
}

function ContestColumn({
  election,
  contests,
  width,
  gridRow,
  gridColumn,
  pageNumber,
}: {
  election: Election;
  contests: Contests;
  width: number;
  gridRow: number;
  gridColumn: number;
  pageNumber: number;
}): [Rectangle, GridPosition[]] {
  const contestPositions: GridPosition[] = [];
  const contestRectangles: Rectangle[] = [];
  let lastContestRow = 0;

  for (const contest of contests) {
    const ContestComponent =
      contest.type === 'candidate' ? CandidateContest : BallotMeasure;
    const [contestRectangle, optionPostions] = ContestComponent({
      election,
      contest,
      row: lastContestRow + CONTEST_ROW_MARGIN,
      gridRow: gridRow + lastContestRow + CONTEST_ROW_MARGIN,
      gridColumn,
      pageNumber,
    });
    lastContestRow += yToRow(contestRectangle.height) + CONTEST_ROW_MARGIN;
    contestRectangles.push(contestRectangle);
    contestPositions.push(...optionPostions);
  }

  const column: Rectangle = {
    type: 'Rectangle',
    ...gridPosition({ row: gridRow, column: gridColumn }),
    width,
    height: gridHeight(lastContestRow),
    children: contestRectangles,
  };

  return [column, contestPositions];
}

/**
 * A chunk of contest columns that fits within the contests area of a page. E.g.
 * a chunk of three-column contests, or a chunk of one-column contests.
 */
function ContestColumnsChunk({
  election,
  contestColumns,
  height,
  gridRow,
  gridColumn,
  pageNumber,
}: {
  election: Election;
  contestColumns: Contests[];
  height: number;
  gridRow: number;
  gridColumn: number;
  pageNumber: number;
}): [Rectangle, GridPosition[]] {
  const columnPositions: GridPosition[] = [];
  const columnRectangles: Rectangle[] = [];
  let lastColumnColumn = 0;
  const columnWidth =
    contestColumns.length === 3
      ? CONTEST_COLUMN_WIDTH
      : CONTENT_AREA_COLUMN_WIDTH;

  for (const contestColumn of contestColumns) {
    const [columnRectangle, contestPositions] = ContestColumn({
      election,
      contests: contestColumn,
      width: gridWidth(columnWidth),
      gridRow,
      gridColumn: gridColumn + lastColumnColumn,
      pageNumber,
    });
    columnRectangles.push(columnRectangle);
    columnPositions.push(...contestPositions);
    lastColumnColumn += columnWidth + GUTTER_WIDTH;
  }

  const section: Rectangle = {
    type: 'Rectangle',
    ...gridPosition({ row: 0, column: 0 }),
    width: gridWidth(lastColumnColumn - GUTTER_WIDTH),
    height,
    children: columnRectangles,
  };

  return [section, columnPositions];
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
  const contests = getContests({ election, ballotStyle });
  if (contests.length === 0) {
    throw new Error('No contests assigned to this precinct.');
  }
  const contestSections: Array<AnyContest[]> = iter(contests)
    .partition((contest) => contest.type === 'candidate')
    .filter((section) => section.length > 0);

  // Iterate over the contest sections, laying out as many contests as
  // possible on each page until we run out of contests
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
      CONTEST_ROW_MARGIN * 2 -
      headerAndInstructionsRowHeight -
      FOOTER_ROW_HEIGHT;

    // Lay out as many contests as possible on the current page
    let heightUsed = 0;
    const contestObjects: AnyElement[] = [];
    while (
      heightUsed < gridHeight(contestsRowHeight) &&
      contestSectionsLeftToLayOut.length > 0
    ) {
      const contestSection = assertDefined(contestSectionsLeftToLayOut.shift());
      // Lay out contests just to get their heights
      const contestsWithHeights = contestSection.map((contest) => {
        const ContestComponent =
          contest.type === 'candidate' ? CandidateContest : BallotMeasure;
        const [{ height }] = ContestComponent({
          election,
          contest,
          row: 0,
          gridRow: 0,
          gridColumn: 0,
          pageNumber: 0,
        });
        if (height > gridHeight(MAX_CONTEST_ROW_HEIGHT)) {
          throw new Error(`Contest ${contest.id} is too tall to fit on a page`);
        }
        return {
          contest,
          height: height + gridHeight(CONTEST_ROW_MARGIN),
        };
      });

      const { columns, height, leftoverElements } = layOutInColumns({
        elements: contestsWithHeights,
        numColumns: contestSection[0].type === 'candidate' ? 3 : 1,
        maxColumnHeight: gridHeight(contestsRowHeight) - heightUsed,
      });

      // Put leftover elements back on the front of the queue
      if (leftoverElements.length > 0) {
        contestSectionsLeftToLayOut = [
          leftoverElements.map(({ contest }) => contest),
          ...contestSectionsLeftToLayOut,
        ];
      }

      // If there wasn't enough room left for any contests, go to the next page
      if (height === 0) {
        break;
      }

      const [chunkRectangle, chunkPositions] = ContestColumnsChunk({
        election,
        contestColumns: columns.map((column) =>
          column.map(({ contest }) => contest)
        ),
        height,
        gridRow:
          TIMING_MARKS_ROW_HEIGHT +
          headerAndInstructionsRowHeight +
          yToRow(heightUsed),
        gridColumn: 2,
        pageNumber,
      });

      debug(
        `Layed out ${contestSection.length - leftoverElements.length} contests`
      );
      contestObjects.push(chunkRectangle);
      heightUsed += height;
      gridPositions.push(...chunkPositions);
    }

    if (contestObjects.length === 0) {
      contestObjects.push({
        type: 'TextBox',
        ...gridPosition({
          row:
            TIMING_MARKS_ROW_HEIGHT +
            headerAndInstructionsRowHeight +
            contestsRowHeight / 2,
          column: GRID.columns / 2 - 7,
        }),
        width: gridWidth(15),
        height: gridHeight(2),
        textLines: ['This page intentionally left blank.'],
        ...FontStyles.H2,
      });
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
