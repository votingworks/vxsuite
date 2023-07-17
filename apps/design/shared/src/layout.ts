import {
  assert,
  assertDefined,
  iter,
  ok,
  Result,
  throwIllegalValue,
  wrapException,
} from '@votingworks/basics';
import {
  AnyContest,
  BallotPaperSize,
  BallotStyle,
  BallotTargetMarkPosition,
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

// In inches
export function dimensionsForPaper(paperSize: BallotPaperSize): {
  width: number;
  height: number;
} {
  switch (paperSize) {
    case BallotPaperSize.Letter:
      return {
        width: 8.5,
        height: 11,
      };
    case BallotPaperSize.Legal:
      return {
        width: 8.5,
        height: 14,
      };
    case BallotPaperSize.Custom17:
      return {
        width: 8.5,
        height: 17,
      };
    case BallotPaperSize.Custom18:
      return {
        width: 8.5,
        height: 18,
      };
    case BallotPaperSize.Custom21:
      return {
        width: 8.5,
        height: 21,
      };
    case BallotPaperSize.Custom22:
      return {
        width: 8.5,
        height: 22,
      };
    default:
      throwIllegalValue(paperSize);
  }
}

export function gridForPaper(paperSize: BallotPaperSize): GridDimensions {
  const columnsPerInch = 4;
  const rowsPerInch = 4;
  const dimensions = dimensionsForPaper(paperSize);
  return {
    rows: dimensions.height * rowsPerInch - 3,
    columns: dimensions.width * columnsPerInch,
  };
}

export const PPI = 72;

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function measurements(paperSize: BallotPaperSize) {
  const grid = gridForPaper(paperSize);
  const HEADER_ROW_HEIGHT = 4.5;
  const INSTRUCTIONS_ROW_HEIGHT = 3.5;
  const HEADER_AND_INSTRUCTIONS_ROW_HEIGHT =
    HEADER_ROW_HEIGHT + INSTRUCTIONS_ROW_HEIGHT;
  const FOOTER_ROW_HEIGHT = 2;
  const TIMING_MARKS_ROW_HEIGHT = 1.5; // Includes margin
  const CONTENT_AREA_ROW_HEIGHT = grid.rows - TIMING_MARKS_ROW_HEIGHT * 2 + 1;
  const CONTENT_AREA_COLUMN_WIDTH = grid.columns - 3;
  const GUTTER_WIDTH = 0.5;
  const CONTEST_COLUMN_WIDTH = 9.5;
  const CONTEST_ROW_MARGIN = 0.5;
  const MAX_CONTEST_ROW_HEIGHT =
    CONTENT_AREA_ROW_HEIGHT - CONTEST_ROW_MARGIN * 2 - FOOTER_ROW_HEIGHT;

  const dimensions = dimensionsForPaper(paperSize);
  const DOCUMENT_WIDTH = dimensions.width * PPI;
  const DOCUMENT_HEIGHT = dimensions.height * PPI;
  const COLUMN_GAP = DOCUMENT_WIDTH / (grid.columns + 1);
  const ROW_GAP = DOCUMENT_HEIGHT / (grid.rows + 1);

  return {
    GRID: grid,
    HEADER_ROW_HEIGHT,
    INSTRUCTIONS_ROW_HEIGHT,
    HEADER_AND_INSTRUCTIONS_ROW_HEIGHT,
    FOOTER_ROW_HEIGHT,
    TIMING_MARKS_ROW_HEIGHT,
    CONTENT_AREA_ROW_HEIGHT,
    CONTENT_AREA_COLUMN_WIDTH,
    GUTTER_WIDTH,
    CONTEST_COLUMN_WIDTH,
    CONTEST_ROW_MARGIN,
    MAX_CONTEST_ROW_HEIGHT,
    DOCUMENT_WIDTH,
    DOCUMENT_HEIGHT,
    COLUMN_GAP,
    ROW_GAP,
  };
}
type Measurements = ReturnType<typeof measurements>;

export interface GridPoint {
  row: number;
  column: number;
}
export interface PixelPoint {
  x: number;
  y: number;
}

export function gridPosition(
  { row, column }: GridPoint,
  m: Measurements
): PixelPoint {
  return {
    x: column * m.COLUMN_GAP,
    y: row * m.ROW_GAP,
  };
}

function gridWidth(gridUnits: number, m: Measurements): number {
  return gridUnits * m.COLUMN_GAP;
}

function gridHeight(gridUnits: number, m: Measurements): number {
  return gridUnits * m.ROW_GAP;
}

function yToRow(y: number, m: Measurements): number {
  return Math.round((y / m.ROW_GAP) * 10) / 10;
}

function xToColumn(x: number, m: Measurements): number {
  return Math.round((x / m.COLUMN_GAP) * 10) / 10;
}

export function Bubble({
  row,
  column,
  isFilled,
  m,
}: {
  row: number;
  column: number;
  isFilled: boolean;
  m: Measurements;
}): Rectangle {
  const bubbleWidth = 0.2 * PPI;
  const bubbleHeight = 0.13 * PPI;
  const center = gridPosition({ row, column }, m);
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
  m,
}: {
  row: number;
  column: number;
  m: Measurements;
}): Rectangle {
  const markWidth = 0.1875 * PPI;
  const markHeight = 0.0625 * PPI;
  const center = gridPosition({ row, column }, m);
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
  m,
}: {
  pageNumber: number;
  ballotStyleIndex: number;
  precinctIndex: number;
  m: Measurements;
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
    width: m.DOCUMENT_WIDTH,
    height: m.DOCUMENT_HEIGHT,
    children: [
      // Top
      range(1, m.GRID.columns + 1).map((column) =>
        TimingMark({ row: 1, column, m })
      ),
      // Bottom
      [...pageMetadata.entries()]
        .filter(([, bit]) => bit === 1)
        .map(([column]) =>
          TimingMark({ row: m.GRID.rows, column: column + 1, m })
        ),
      // Left
      range(1, m.GRID.rows + 1).map((row) => TimingMark({ row, column: 1, m })),
      // Right
      range(1, m.GRID.rows + 1).map((row) =>
        TimingMark({ row, column: m.GRID.columns, m })
      ),
    ].flat(),
  };
}

function HeaderAndInstructions({
  election,
  pageNumber,
  m,
}: {
  election: Election;
  pageNumber: number;
  m: Measurements;
}): Rectangle | null {
  if (pageNumber % 2 === 0) {
    return null;
  }

  const header: Rectangle = {
    type: 'Rectangle',
    ...gridPosition({ row: 0, column: 0 }, m),
    width: gridWidth(m.CONTENT_AREA_COLUMN_WIDTH, m),
    height: gridHeight(m.HEADER_ROW_HEIGHT, m),
    children: [
      {
        type: 'TextBox',
        ...gridPosition({ row: 0, column: 5.5 }, m),
        width: gridWidth(m.CONTENT_AREA_COLUMN_WIDTH - 1, m),
        height: gridHeight(3, m),
        textLines: ['Sample Ballot', election.title],
        ...FontStyles.H1,
      },
      {
        type: 'TextBox',
        ...gridPosition({ row: 2.25, column: 5.5 }, m),
        width: gridWidth(m.CONTENT_AREA_COLUMN_WIDTH - 1, m),
        height: gridHeight(5, m),
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
        ...gridPosition({ row: 0, column: 0.5 }, m),
        width: gridWidth(4, m),
        height: gridHeight(4, m),
        href: election.sealUrl ?? '/seals/state-of-hamilton-official-seal.svg',
      },
    ],
  };

  const instructions: Rectangle = {
    type: 'Rectangle',
    ...gridPosition({ row: m.HEADER_ROW_HEIGHT, column: 0 }, m),
    width: gridWidth(m.CONTENT_AREA_COLUMN_WIDTH, m),
    height: gridHeight(m.INSTRUCTIONS_ROW_HEIGHT, m),
    stroke: 'black',
    strokeWidth: 0.5,
    fill: '#ededed',
    children: [
      // Thicker top border
      {
        type: 'Rectangle',
        ...gridPosition({ row: 0, column: 0 }, m),
        width: gridWidth(m.CONTENT_AREA_COLUMN_WIDTH, m),
        height: 2,
        fill: 'black',
      },
      {
        type: 'TextBox',
        ...gridPosition({ row: 0.25, column: 0.5 }, m),
        width: gridWidth(m.CONTENT_AREA_COLUMN_WIDTH - 1, m),
        height: gridHeight(m.INSTRUCTIONS_ROW_HEIGHT - 1, m),
        textLines: ['Instructions'],
        ...FontStyles.H3,
      },
      {
        type: 'TextBox',
        ...gridPosition({ row: 1.1, column: 0.5 }, m),
        width: gridWidth(m.CONTENT_AREA_COLUMN_WIDTH - 1, m),
        height: gridHeight(m.INSTRUCTIONS_ROW_HEIGHT - 1, m),
        textLines: ['To Vote:'],
        ...FontStyles.SMALL,
        fontWeight: FontWeights.BOLD,
      },
      {
        type: 'TextBox',
        ...gridPosition({ row: 1.7, column: 0.5 }, m),
        width: gridWidth(m.CONTENT_AREA_COLUMN_WIDTH - 1, m),
        height: gridHeight(m.INSTRUCTIONS_ROW_HEIGHT - 1, m),
        textLines: [
          'To vote, completely fill in',
          'the oval next to your choice.',
        ],
        ...FontStyles.SMALL,
      },
      {
        type: 'Image',
        ...gridPosition({ row: 1.1, column: 7.5 }, m),
        width: gridWidth(5, m),
        height: gridHeight(2, m),
        href: '/images/instructions-fill-oval.svg',
      },
      {
        type: 'TextBox',
        ...gridPosition({ row: 1.1, column: 13 }, m),
        width: gridWidth(m.CONTENT_AREA_COLUMN_WIDTH - 1, m),
        height: gridHeight(m.INSTRUCTIONS_ROW_HEIGHT - 1, m),
        textLines: ['To Vote for a Write-In:'],
        ...FontStyles.SMALL,
        fontWeight: FontWeights.BOLD,
      },
      {
        type: 'TextBox',
        ...gridPosition({ row: 1.7, column: 13 }, m),
        width: gridWidth(m.CONTENT_AREA_COLUMN_WIDTH - 1, m),
        height: gridHeight(m.INSTRUCTIONS_ROW_HEIGHT - 1, m),
        textLines: [
          'To vote for a person whose name is not on the',
          'ballot, write the person’s name on the "write-in" line',
          'and completely fill in the oval to the left of the line.',
        ],
        ...FontStyles.SMALL,
      },
      {
        type: 'Image',
        ...gridPosition({ row: 1.1, column: 25.5 }, m),
        width: gridWidth(5, m),
        height: gridHeight(1.5, m),
        href: '/images/instructions-write-in.svg',
      },
    ],
  };

  return {
    type: 'Rectangle',
    ...gridPosition({ row: m.TIMING_MARKS_ROW_HEIGHT, column: 2 }, m),
    width: gridWidth(m.CONTENT_AREA_COLUMN_WIDTH, m),
    height: gridHeight(m.HEADER_AND_INSTRUCTIONS_ROW_HEIGHT, m),
    children: [header, instructions],
  };
}

function Footer({
  precinct,
  pageNumber,
  totalPages,
  m,
}: {
  precinct: Precinct;
  pageNumber: number;
  totalPages: number;
  m: Measurements;
}): Rectangle {
  const isFront = pageNumber % 2 === 1;
  const continueVoting: AnyElement[] = [
    {
      type: 'TextBox',
      ...gridPosition({ row: 0.5, column: isFront ? 16 : 18 }, m),
      width: gridWidth(m.CONTENT_AREA_COLUMN_WIDTH - 1, m),
      height: gridHeight(m.FOOTER_ROW_HEIGHT - 1, m),
      textLines: [
        isFront
          ? 'Turn ballot over and continue voting'
          : 'Continue voting on next ballot',
      ],
      ...FontStyles.H3,
    },
    {
      type: 'Image',
      ...gridPosition({ row: 0.25, column: 29 }, m),
      width: gridWidth(1.5, m),
      height: gridHeight(1.5, m),
      href: '/images/arrow-right-circle.svg',
    },
  ];

  const ballotComplete: AnyElement[] = [
    {
      type: 'TextBox',
      ...gridPosition({ row: 0.5, column: 20.5 }, m),
      width: gridWidth(m.CONTENT_AREA_COLUMN_WIDTH - 1, m),
      height: gridHeight(m.FOOTER_ROW_HEIGHT - 1, m),
      textLines: ['You have completed voting.'],
      ...FontStyles.H3,
    },
  ];

  const endOfPageInstruction =
    pageNumber === totalPages ? ballotComplete : continueVoting;

  return {
    type: 'Rectangle',
    ...gridPosition(
      {
        row:
          m.TIMING_MARKS_ROW_HEIGHT +
          m.CONTENT_AREA_ROW_HEIGHT -
          m.FOOTER_ROW_HEIGHT,
        column: 2,
      },
      m
    ),
    width: gridWidth(m.CONTENT_AREA_COLUMN_WIDTH, m),
    height: gridHeight(m.FOOTER_ROW_HEIGHT, m),
    fill: '#ededed',
    stroke: 'black',
    strokeWidth: 0.5,
    children: [
      // Thicker top border
      {
        type: 'Rectangle',
        ...gridPosition({ row: 0, column: 0 }, m),
        width: gridWidth(m.CONTENT_AREA_COLUMN_WIDTH, m),
        height: 2,
        fill: 'black',
      },
      {
        type: 'TextBox',
        ...gridPosition({ row: 0.25, column: 0.5 }, m),
        width: gridWidth(m.CONTENT_AREA_COLUMN_WIDTH - 1, m),
        height: gridHeight(m.FOOTER_ROW_HEIGHT - 1, m),
        textLines: ['Page'],
        ...FontStyles.SMALL,
      },
      {
        type: 'TextBox',
        ...gridPosition({ row: 0.8, column: 0.5 }, m),
        width: gridWidth(m.CONTENT_AREA_COLUMN_WIDTH - 1, m),
        height: gridHeight(m.FOOTER_ROW_HEIGHT - 1, m),
        textLines: [`${pageNumber}/${totalPages}`],
        ...FontStyles.H2,
      },
      {
        type: 'TextBox',
        ...gridPosition({ row: 0.25, column: 3.5 }, m),
        width: gridWidth(m.CONTENT_AREA_COLUMN_WIDTH - 1, m),
        height: gridHeight(m.FOOTER_ROW_HEIGHT - 1, m),
        textLines: ['Precinct'],
        ...FontStyles.SMALL,
      },
      {
        type: 'TextBox',
        ...gridPosition({ row: 0.8, column: 3.5 }, m),
        width: gridWidth(m.CONTENT_AREA_COLUMN_WIDTH - 1, m),
        height: gridHeight(m.FOOTER_ROW_HEIGHT - 1, m),
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
  m,
}: {
  election: Election;
  contest: AnyContest;
  row: number;
  gridRow: number;
  gridColumn: number;
  pageNumber: number;
  m: Measurements;
}): [Rectangle, GridPosition[]] {
  assert(contest.type === 'candidate');

  const bubblePosition =
    election.ballotLayout?.targetMarkPosition ?? BallotTargetMarkPosition.Left;

  // Temp hack until we can change the timing mark grid dimensions since they
  // don't evenly divide into three columns: expand the last contest column (if
  // bubbles on left) or first contest column (if bubbles on right)
  const width = (
    bubblePosition === BallotTargetMarkPosition.Left
      ? gridColumn > 20
      : gridColumn < 10
  )
    ? m.CONTENT_AREA_COLUMN_WIDTH -
      2 * (m.CONTEST_COLUMN_WIDTH + m.GUTTER_WIDTH)
    : m.CONTEST_COLUMN_WIDTH;
  const titleLines = textWrap(
    contest.title,
    FontStyles.H3,
    gridWidth(width - 0.5, m)
  );
  const titleTextBox: TextBox = {
    type: 'TextBox',
    ...gridPosition({ row: 0.5, column: 0.5 }, m),
    width: gridWidth(width - 1, m),
    height: gridHeight(titleLines.length, m),
    textLines: titleLines,
    ...FontStyles.H3,
  };

  const headingRowHeight = 1 + titleLines.length;
  const heading: Rectangle = {
    type: 'Rectangle',
    ...gridPosition({ row: 0, column: 0 }, m),
    width: gridWidth(width, m),
    height: gridHeight(headingRowHeight, m),
    children: [
      // Thicker top border
      {
        type: 'Rectangle',
        ...gridPosition({ row: 0, column: 0 }, m),
        width: gridWidth(width, m),
        height: 2,
        fill: 'black',
      },
      titleTextBox,
      {
        type: 'TextBox',
        ...gridPosition({ row: 0, column: 0.5 }, m),
        // TODO: better approach to line spacing
        y:
          titleTextBox.y +
          titleLines.length * FontStyles.H3.lineHeight +
          gridHeight(0.25, m),
        width: gridWidth(width - 1, m),
        height: gridHeight(1, m),
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

  const bubbleColumn =
    bubblePosition === BallotTargetMarkPosition.Left ? 1 : width - 1;
  const optionLabelColumn =
    bubblePosition === BallotTargetMarkPosition.Left ? 1.75 : 0.5;
  const optionTextAlign =
    bubblePosition === BallotTargetMarkPosition.Left ? 'left' : 'right';

  const optionRowHeight = 2;
  const options: Rectangle[] = [];
  for (const [index, candidate] of contest.candidates.entries()) {
    const optionRow = headingRowHeight + index * optionRowHeight;
    options.push({
      type: 'Rectangle',
      ...gridPosition(
        {
          row: optionRow,
          column: 0,
        },
        m
      ),
      width: gridWidth(width, m),
      height: gridHeight(optionRowHeight, m),
      // fill: 'rgb(0, 255, 0, 0.2)',
      children: [
        Bubble({
          row: 1,
          column: bubbleColumn,
          isFilled: false,
          m,
        }),
        {
          type: 'TextBox',
          ...gridPosition(
            {
              row: 0.6,
              column: optionLabelColumn,
            },
            m
          ),
          width: gridWidth(width - 2.25, m),
          height: gridHeight(1, m),
          // TODO wrap candidate.name
          textLines: [candidate.name],
          ...FontStyles.BODY,
          fontWeight: FontWeights.BOLD,
          align: optionTextAlign,
        },
        {
          type: 'TextBox',
          ...gridPosition(
            {
              row: 1.3,
              column: optionLabelColumn,
            },
            m
          ),
          width: gridWidth(width - 2.25, m),
          height: gridHeight(1, m),
          textLines: [getCandidatePartiesDescription(election, candidate)],
          ...FontStyles.BODY,
          align: optionTextAlign,
        },
      ],
    });

    optionPostions.push({
      type: 'option',
      side,
      contestId: contest.id,
      column: gridColumn + bubbleColumn - 1,
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
        ...gridPosition(
          {
            row: optionRow,
            column: 0,
          },
          m
        ),
        width: gridWidth(width, m),
        height: gridHeight(writeInRowHeight, m),
        children: [
          Bubble({
            row: 1,
            column: bubbleColumn,
            isFilled: false,
            m,
          }),
          {
            type: 'Rectangle', // Line?
            ...gridPosition(
              {
                row: 1.25,
                column: optionLabelColumn,
              },
              m
            ),
            width: gridWidth(width - 2.25, m),
            height: 1,
            fill: 'black',
          },
          {
            type: 'TextBox',
            ...gridPosition(
              {
                row: 1.3,
                column: optionLabelColumn,
              },
              m
            ),
            width: gridWidth(width - 2.5, m),
            height: gridHeight(1, m),
            textLines: ['write-in'],
            ...FontStyles.SMALL,
            align: optionTextAlign,
          },
        ],
      });

      optionPostions.push({
        type: 'write-in',
        side,
        contestId: contest.id,
        column: gridColumn + bubbleColumn - 1,
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
    gridHeight(0.5, m);

  return [
    {
      type: 'Rectangle',
      ...gridPosition({ row, column: 0 }, m),
      width: gridWidth(width, m),
      height: contestHeight,
      stroke: 'black',
      strokeWidth: 0.5,
      children: [heading, ...options],
    },
    optionPostions,
  ];
}

function BallotMeasure({
  election,
  contest,
  row,
  gridRow,
  gridColumn,
  pageNumber,
  m,
}: {
  election: Election;
  contest: AnyContest;
  row: number;
  gridRow: number;
  gridColumn: number;
  pageNumber: number;
  m: Measurements;
}): [Rectangle, GridPosition[]] {
  assert(contest.type === 'yesno');

  const width = m.CONTENT_AREA_COLUMN_WIDTH;
  const titleLines = textWrap(
    contest.title,
    FontStyles.H3,
    gridWidth(width - 0.5, m)
  );
  const titleTextBox: TextBox = {
    type: 'TextBox',
    ...gridPosition({ row: 0.5, column: 0.5 }, m),
    width: gridWidth(width - 1, m),
    height: gridHeight(titleLines.length, m),
    textLines: titleLines,
    ...FontStyles.H3,
  };

  const descriptionLines = textWrap(
    contest.description,
    FontStyles.BODY,
    gridWidth(width, m)
  );

  const headingRowHeight =
    titleLines.length +
    Math.ceil(yToRow(descriptionLines.length * FontStyles.BODY.lineHeight, m));
  const heading: Rectangle = {
    type: 'Rectangle',
    ...gridPosition({ row: 0, column: 0 }, m),
    width: gridWidth(width, m),
    height: gridHeight(headingRowHeight, m),
    children: [
      // Thicker top border
      {
        type: 'Rectangle',
        ...gridPosition({ row: 0, column: 0 }, m),
        width: gridWidth(width, m),
        height: 2,
        fill: 'black',
      },
      titleTextBox,
      {
        type: 'TextBox',
        // y coord will be set below
        ...gridPosition({ row: 0, column: 0.5 }, m),
        y:
          titleTextBox.y +
          titleLines.length * FontStyles.H3.lineHeight +
          gridHeight(0.25, m),
        width: gridWidth(width - 1, m),
        // TODO: better support for text height with descenders
        height: descriptionLines.length * FontStyles.BODY.lineHeight + 5,
        textLines: descriptionLines,
        ...FontStyles.BODY,
      },
    ],
  };

  const optionPositions: GridPosition[] = [];
  const side = pageNumber % 2 === 1 ? 'front' : 'back';
  const bubblePosition = election.ballotLayout?.targetMarkPosition ?? 'left';

  const choices = [
    { id: 'yes', label: 'Yes' },
    { id: 'no', label: 'No' },
  ];

  const bubbleColumn =
    bubblePosition === BallotTargetMarkPosition.Left ? 1 : width - 1;
  const optionLabelColumn =
    bubblePosition === BallotTargetMarkPosition.Left ? 1.75 : 0.5;
  const optionTextAlign =
    bubblePosition === BallotTargetMarkPosition.Left ? 'left' : 'right';

  const optionRowHeight = 1;
  const options: Rectangle[] = [];
  for (const [index, choice] of choices.entries()) {
    const optionRow = headingRowHeight + index * optionRowHeight;
    options.push({
      type: 'Rectangle',
      ...gridPosition(
        {
          row: optionRow,
          column: 0,
        },
        m
      ),
      width: gridWidth(width, m),
      height: gridHeight(optionRowHeight, m),
      // fill: 'rgb(0, 255, 0, 0.2)',
      children: [
        Bubble({
          row: 1,
          column: bubbleColumn,
          isFilled: false,
          m,
        }),
        {
          type: 'TextBox',
          ...gridPosition(
            {
              row: 0.65,
              column: optionLabelColumn,
            },
            m
          ),
          width: gridWidth(width - 2.25, m),
          height: gridHeight(1, m),
          textLines: [choice.label],
          ...FontStyles.BODY,
          fontWeight: FontWeights.BOLD,
          align: optionTextAlign,
        },
      ],
    });

    optionPositions.push({
      type: 'option',
      side,
      contestId: contest.id,
      column: gridColumn + bubbleColumn - 1,
      row: gridRow + optionRow,
      optionId: choice.id,
    });
  }

  const contestHeight =
    heading.height +
    iter(options)
      .map((option) => option.height)
      .sum() +
    gridHeight(1.5, m);

  return [
    {
      type: 'Rectangle',
      ...gridPosition({ row, column: 0 }, m),
      width: gridWidth(width, m),
      height: contestHeight,
      stroke: 'black',
      strokeWidth: 0.5,
      children: [heading, ...options],
    },
    optionPositions,
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
  gridRow,
  gridColumn,
  pageNumber,
  m,
}: {
  election: Election;
  contests: Contests;
  gridRow: number;
  gridColumn: number;
  pageNumber: number;
  m: Measurements;
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
      row: lastContestRow + m.CONTEST_ROW_MARGIN,
      gridRow: gridRow + lastContestRow + m.CONTEST_ROW_MARGIN,
      gridColumn,
      pageNumber,
      m,
    });
    lastContestRow += yToRow(contestRectangle.height, m) + m.CONTEST_ROW_MARGIN;
    contestRectangles.push(contestRectangle);
    contestPositions.push(...optionPostions);
  }

  const column: Rectangle = {
    type: 'Rectangle',
    ...gridPosition({ row: gridRow, column: gridColumn }, m),
    width: contestRectangles[0]?.width ?? 0,
    height: gridHeight(lastContestRow, m),
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
  m,
}: {
  election: Election;
  contestColumns: Contests[];
  height: number;
  gridRow: number;
  gridColumn: number;
  pageNumber: number;
  m: Measurements;
}): [Rectangle, GridPosition[]] {
  const columnPositions: GridPosition[] = [];
  const columnRectangles: Rectangle[] = [];
  let lastColumnColumn = 0;

  for (const contestColumn of contestColumns) {
    const [columnRectangle, contestPositions] = ContestColumn({
      election,
      contests: contestColumn,
      gridRow,
      gridColumn: gridColumn + lastColumnColumn,
      pageNumber,
      m,
    });
    columnRectangles.push(columnRectangle);
    columnPositions.push(...contestPositions);
    lastColumnColumn += xToColumn(columnRectangle.width, m) + m.GUTTER_WIDTH;
  }

  const section: Rectangle = {
    type: 'Rectangle',
    ...gridPosition({ row: 0, column: 0 }, m),
    width: gridWidth(lastColumnColumn - m.GUTTER_WIDTH, m),
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
  const paperSize = election.ballotLayout?.paperSize ?? BallotPaperSize.Letter;
  const m = measurements(paperSize);

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
  while (contestSectionsLeftToLayOut.length > 0 || pages.length % 2 !== 0) {
    const pageNumber = pages.length + 1;
    debug(
      `Laying out page ${pageNumber}, ${contestSectionsLeftToLayOut.length} contest sections left`
    );
    const headerAndInstructions = HeaderAndInstructions({
      election,
      pageNumber,
      m,
    });
    const headerAndInstructionsRowHeight = headerAndInstructions
      ? m.HEADER_AND_INSTRUCTIONS_ROW_HEIGHT
      : 0;
    const contestsRowHeight =
      m.CONTENT_AREA_ROW_HEIGHT -
      m.CONTEST_ROW_MARGIN * 2 -
      headerAndInstructionsRowHeight -
      m.FOOTER_ROW_HEIGHT;

    // Lay out as many contests as possible on the current page
    let heightUsed = 0;
    const contestObjects: AnyElement[] = [];
    while (
      heightUsed < gridHeight(contestsRowHeight, m) &&
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
          m,
        });
        if (height > gridHeight(m.MAX_CONTEST_ROW_HEIGHT, m)) {
          throw new Error(`Contest ${contest.id} is too tall to fit on a page`);
        }
        return {
          contest,
          height: height + gridHeight(m.CONTEST_ROW_MARGIN, m),
        };
      });

      const { columns, height, leftoverElements } = layOutInColumns({
        elements: contestsWithHeights,
        numColumns: contestSection[0].type === 'candidate' ? 3 : 1,
        maxColumnHeight: gridHeight(contestsRowHeight, m) - heightUsed,
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
          m.TIMING_MARKS_ROW_HEIGHT +
          headerAndInstructionsRowHeight +
          yToRow(heightUsed, m),
        gridColumn: 2,
        pageNumber,
        m,
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
        ...gridPosition(
          {
            row:
              m.TIMING_MARKS_ROW_HEIGHT +
              headerAndInstructionsRowHeight +
              contestsRowHeight / 2,
            column: m.GRID.columns / 2 - 7,
          },
          m
        ),
        width: gridWidth(15, m),
        height: gridHeight(2, m),
        textLines: ['This page intentionally left blank.'],
        ...FontStyles.H2,
      });
    }

    pages.push({
      children: [
        TimingMarkGrid({ pageNumber, ballotStyleIndex, precinctIndex, m }),
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
        m,
      })
    );
  }

  return {
    document: {
      width: m.DOCUMENT_WIDTH,
      height: m.DOCUMENT_HEIGHT,
      pages,
    },
    gridLayout: {
      precinctId: precinct.id,
      ballotStyleId: ballotStyle.id,
      columns: m.GRID.columns,
      rows: m.GRID.rows,
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
