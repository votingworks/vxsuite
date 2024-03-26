import {
  assert,
  assertDefined,
  iter,
  lines,
  ok,
  range,
  Result,
  uniqueBy,
  wrapException,
} from '@votingworks/basics';
import {
  AnyContest,
  ballotPaperDimensions,
  BallotPaperSize,
  BallotStyle,
  BallotStyleId,
  BallotType,
  Contests,
  convertVxfElectionToCdfBallotDefinition,
  Election,
  ElectionDefinition,
  getCandidatePartiesDescription,
  getContests,
  getPartyForBallotStyle,
  getPrecinctById,
  GridLayout,
  GridPosition,
  Precinct,
  PrecinctId,
  safeParseElectionDefinition,
  UiStringsPackage,
} from '@votingworks/types';
import makeDebug from 'debug';
import {
  AnyElement,
  Bubble,
  Document,
  Page,
  Rectangle,
  TextBox,
} from './document_types';
import {
  encodeInQrCode,
  encodeMetadataInQrCode,
  QrCodeData,
} from './encode_metadata';

const debug = makeDebug('layout');

/**
 * Custom content overrides specific to NH elections. Until we have a more
 * robust ballot template/content management system, we use these NH-specific
 * types to keep the customization contained and avoid building a premature
 * abstraction around ballot customizations.
 */
export interface NhCustomContent {
  electionTitle?: string;
  clerkSignatureImage?: string;
  clerkSignatureCaption?: string;
}
export type NhCustomContentByBallotStyle = Record<
  BallotStyleId,
  NhCustomContent
>;

export const FontWeights = {
  NORMAL: 400,
  SEMIBOLD: 500,
  BOLD: 700,
} as const;

type FontWeight = (typeof FontWeights)[keyof typeof FontWeights];

export interface FontStyle {
  fontSize: number;
  fontWeight: FontWeight;
  lineHeight: number;
}

// TODO more accurate text measurement
function characterWidth(character: string, fontStyle: FontStyle): number {
  const isUpperCase = character.toUpperCase() === character;
  return (
    fontStyle.fontSize * (isUpperCase ? 0.69 : 0.43) +
    (fontStyle.fontWeight - 400) / 500
  );
}

export function textWidth(text: string, fontStyle: FontStyle): number {
  return iter(text.split('').map((c) => characterWidth(c, fontStyle))).sum();
}

function wrapLine(line: string, fontStyle: FontStyle, width: number): string[] {
  const words = line.split(' ');
  const results: string[] = [];
  let currentLine = '';
  for (const word of words) {
    const extendedLine =
      currentLine.length > 0 ? [currentLine, word].join(' ') : word;
    if (textWidth(extendedLine, fontStyle) <= width) {
      currentLine = extendedLine;
    } else {
      results.push(currentLine);
      currentLine = word;
    }
  }
  results.push(currentLine);
  return results;
}

function textWrap(text: string, fontStyle: FontStyle, width: number): string[] {
  return lines(text)
    .flatMap((line) => wrapLine(line, fontStyle, width))
    .toArray();
}

function textHeight(textLines: string[], fontStyle: FontStyle): number {
  return textLines.length * fontStyle.lineHeight;
}

function TextBlock({
  x,
  y,
  textGroups,
  width,
  align,
}: {
  x: number;
  y: number;
  textGroups: Array<{
    text: string;
    fontStyle: FontStyle;
  }>;
  width: number;
  align?: TextBox['align'];
}): Rectangle {
  const textBoxes: TextBox[] = [];
  let heightUsed = 0;

  for (const { text, fontStyle } of textGroups) {
    const wrappedText = textWrap(text, fontStyle, width);
    textBoxes.push({
      type: 'TextBox',
      x: 0,
      y: heightUsed,
      width,
      height: textHeight(wrappedText, fontStyle) + fontStyle.lineHeight / 4,
      textLines: wrappedText,
      ...fontStyle,
      align,
    });
    heightUsed += textHeight(wrappedText, fontStyle) + fontStyle.lineHeight / 4;
  }

  return {
    type: 'Rectangle',
    x,
    y,
    width,
    height: heightUsed,
    children: textBoxes,
  };
}

export interface GridDimensions {
  rows: number;
  columns: number;
}

export function gridForPaper(paperSize: BallotPaperSize): GridDimensions {
  // Corresponds to the NH Accuvote ballot grid, which we mimic so that our
  // interpreter can support both Accuvote-style ballots and our ballots.
  // This formula is replicated in libs/ballot-interpreter/src/ballot_card.rs.
  const columnsPerInch = 4;
  const rowsPerInch = 4;
  const dimensions = ballotPaperDimensions(paperSize);
  return {
    rows: dimensions.height * rowsPerInch - 3,
    columns: dimensions.width * columnsPerInch,
  };
}

export const PPI = 72;

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function measurements(
  paperSize: BallotPaperSize,
  density: LayoutDensity
) {
  const grid = gridForPaper(paperSize);
  const HEADER_ROW_HEIGHT = [3.75, 3, 2.5][density];
  const INSTRUCTIONS_ROW_HEIGHT = [3.5, 3, 2.5][density];
  const HEADER_AND_INSTRUCTIONS_ROW_HEIGHT =
    HEADER_ROW_HEIGHT + INSTRUCTIONS_ROW_HEIGHT;
  const FOOTER_ROW_HEIGHT = [2, 2, 1.5][density];
  const TIMING_MARKS_ROW_HEIGHT = 1.5; // Includes margin
  const CONTENT_AREA_ROW_HEIGHT = grid.rows - TIMING_MARKS_ROW_HEIGHT * 2 + 1;
  const CONTENT_AREA_COLUMN_WIDTH = grid.columns - 3;
  const GUTTER_WIDTH = 0.5;
  const CONTEST_COLUMN_WIDTH =
    (CONTENT_AREA_COLUMN_WIDTH - GUTTER_WIDTH * 2) / 3;
  const CONTEST_PADDING = [0.5, 0.4, 0.3][density];
  const CONTEST_ROW_MARGIN = 0.4;
  const MAX_CONTEST_ROW_HEIGHT =
    CONTENT_AREA_ROW_HEIGHT - CONTEST_ROW_MARGIN * 2 - FOOTER_ROW_HEIGHT;
  const WRITE_IN_ROW_HEIGHT = [2, 1, 1][density];
  const BALLOT_MEASURE_OPTION_POSITION = ['block', 'block', 'inline'][density];

  const dimensions = ballotPaperDimensions(paperSize);
  const DOCUMENT_WIDTH = dimensions.width * PPI;
  const DOCUMENT_HEIGHT = dimensions.height * PPI;
  const COLUMN_GAP = DOCUMENT_WIDTH / (grid.columns + 1);
  const ROW_GAP = DOCUMENT_HEIGHT / (grid.rows + 1);

  const FontStyles = {
    H1: {
      fontSize: [20, 18, 16][density],
      fontWeight: FontWeights.BOLD,
      lineHeight: [20, 18, 16][density],
    },
    H2: {
      fontSize: [16, 14, 12][density],
      fontWeight: FontWeights.BOLD,
      lineHeight: [16, 14, 12][density],
    },
    H3: {
      fontSize: [13, 11, 9][density],
      fontWeight: FontWeights.BOLD,
      lineHeight: [13, 11, 9][density],
    },
    BODY: {
      fontSize: [10, 9, 8][density],
      fontWeight: FontWeights.NORMAL,
      lineHeight: [10, 9, 8][density],
    },
    SMALL: {
      fontSize: [9, 8, 7][density],
      fontWeight: FontWeights.NORMAL,
      lineHeight: [9, 8, 7][density],
    },
  } as const;

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
    CONTEST_PADDING,
    CONTEST_ROW_MARGIN,
    MAX_CONTEST_ROW_HEIGHT,
    WRITE_IN_ROW_HEIGHT,
    BALLOT_MEASURE_OPTION_POSITION,
    DOCUMENT_WIDTH,
    DOCUMENT_HEIGHT,
    COLUMN_GAP,
    ROW_GAP,
    FontStyles,
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

export function gridPoint(
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
  return y / m.ROW_GAP;
}

function xToColumn(x: number, m: Measurements): number {
  return x / m.COLUMN_GAP;
}

export function OptionBubble({
  row,
  column,
  isFilled,
  gridPosition,
  m,
}: {
  row: number;
  column: number;
  isFilled: boolean;
  gridPosition: GridPosition;
  m: Measurements;
}): Bubble {
  const bubbleWidth = 0.2 * PPI;
  const bubbleHeight = 0.13 * PPI;
  const center = gridPoint({ row, column }, m);
  return {
    type: 'Bubble',
    x: center.x - bubbleWidth / 2,
    y: center.y - bubbleHeight / 2,
    width: bubbleWidth,
    height: bubbleHeight,
    borderRadius: 0.07 * PPI,
    stroke: 'black',
    strokeWidth: 0.5,
    fill: isFilled ? 'black' : 'none',
    gridPosition,
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
  const center = gridPoint({ row, column }, m);
  return {
    type: 'Rectangle',
    x: center.x - markWidth / 2,
    y: center.y - markHeight / 2,
    width: markWidth,
    height: markHeight,
    fill: 'black',
  };
}

export function TimingMarkGrid({ m }: { m: Measurements }): AnyElement {
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
      range(1, m.GRID.columns + 1).map((column) =>
        TimingMark({ row: m.GRID.rows, column, m })
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
  ballotStyle,
  precinct,
  pageNumber,
  ballotType,
  ballotMode,
  nhCustomContent,
  m,
}: {
  election: Election;
  ballotStyle: BallotStyle;
  precinct: Precinct;
  pageNumber: number;
  ballotType: BallotType;
  ballotMode: BallotMode;
  nhCustomContent: NhCustomContent;
  m: Measurements;
}): Rectangle | null {
  if (pageNumber % 2 === 0) {
    return null;
  }

  const sealRowHeight = m.HEADER_ROW_HEIGHT - 0.5;

  const ballotModeLabel: Record<BallotMode, string> = {
    sample: 'Sample',
    test: 'Test',
    official: 'Official',
  };
  const ballotTypeLabel: Record<BallotType, string> = {
    [BallotType.Absentee]: ' Absentee',
    [BallotType.Precinct]: '',
    [BallotType.Provisional]: ' Provisional',
  };
  const ballotTitle = `${ballotModeLabel[ballotMode]}${ballotTypeLabel[ballotType]} Ballot`;
  const party =
    election.type === 'primary'
      ? ` • ${
          assertDefined(
            getPartyForBallotStyle({ election, ballotStyleId: ballotStyle.id })
          ).fullName
        }`
      : '';

  const electionTitle = nhCustomContent.electionTitle ?? election.title;
  const date = Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(election.date.toMidnightDatetimeWithSystemTimezone());

  const clerkSignatureRowHeight = m.HEADER_ROW_HEIGHT - m.HEADER_ROW_HEIGHT / 4;
  const clerkSignatureColumnWidth = nhCustomContent.clerkSignatureImage
    ? 6.5
    : 0;
  const clerkSignatureBlock: Rectangle | undefined =
    nhCustomContent.clerkSignatureImage
      ? {
          type: 'Rectangle',
          ...gridPoint(
            {
              row: (m.HEADER_ROW_HEIGHT - 0.25 - clerkSignatureRowHeight) / 2,
              column:
                m.CONTENT_AREA_COLUMN_WIDTH - clerkSignatureColumnWidth - 0.5,
            },
            m
          ),
          width: gridWidth(clerkSignatureColumnWidth, m),
          height: gridHeight(clerkSignatureRowHeight, m),
          children: [
            {
              type: 'Image',
              ...gridPoint({ row: 0, column: 0 }, m),
              width: gridWidth(clerkSignatureColumnWidth, m),
              height: gridHeight(clerkSignatureRowHeight - 0.5, m),
              contents: nhCustomContent.clerkSignatureImage,
            },
            TextBlock({
              ...gridPoint(
                {
                  row: clerkSignatureRowHeight - 0.5,
                  column: 0,
                },
                m
              ),
              width: gridWidth(clerkSignatureColumnWidth, m),
              textGroups: [
                {
                  text: nhCustomContent.clerkSignatureCaption ?? '',
                  fontStyle: m.FontStyles.BODY,
                },
              ],
              align: 'center',
            }),
          ],
        }
      : undefined;

  const header: Rectangle = {
    type: 'Rectangle',
    ...gridPoint({ row: 0, column: 0 }, m),
    width: gridWidth(m.CONTENT_AREA_COLUMN_WIDTH, m),
    height: gridHeight(m.HEADER_ROW_HEIGHT, m),
    children: [
      TextBlock({
        ...gridPoint(
          { row: m.HEADER_ROW_HEIGHT / 15, column: sealRowHeight + 1.5 },
          m
        ),
        width: gridWidth(
          m.CONTENT_AREA_COLUMN_WIDTH - 1 - clerkSignatureColumnWidth,
          m
        ),
        textGroups: [
          {
            text: `${ballotTitle}${party}`,
            fontStyle: {
              ...m.FontStyles.H1,
              lineHeight: m.FontStyles.H1.lineHeight * 0.85,
            },
          },
          {
            text: `${electionTitle} • ${date}`,
            fontStyle: m.FontStyles.H3,
          },
          {
            text: [precinct.name, election.county.name, election.state]
              .filter(Boolean)
              .join(', '),
            fontStyle: m.FontStyles.BODY,
          },
        ],
      }),
      {
        type: 'Image',
        ...gridPoint(
          {
            row: (m.HEADER_ROW_HEIGHT - 0.25 - sealRowHeight) / 2,
            column: 0.5,
          },
          m
        ),
        width: gridWidth(sealRowHeight, m),
        height: gridHeight(sealRowHeight, m),
        contents: election.seal,
      },
      ...(clerkSignatureBlock ? [clerkSignatureBlock] : []),
    ],
  };

  const instructions: Rectangle = {
    type: 'Rectangle',
    ...gridPoint({ row: m.HEADER_ROW_HEIGHT, column: 0 }, m),
    width: gridWidth(m.CONTENT_AREA_COLUMN_WIDTH, m),
    height: gridHeight(m.INSTRUCTIONS_ROW_HEIGHT, m),
    stroke: 'black',
    strokeWidth: 0.5,
    fill: '#ededed',
    children: [
      // Thicker top border
      {
        type: 'Rectangle',
        ...gridPoint({ row: 0, column: 0 }, m),
        width: gridWidth(m.CONTENT_AREA_COLUMN_WIDTH, m),
        height: 2,
        fill: 'black',
      },
      TextBlock({
        ...gridPoint({ row: 0.25, column: 0.5 }, m),
        width: gridWidth(7.5, m),
        textGroups: [
          {
            text: 'Instructions',
            fontStyle: m.FontStyles.H3,
          },
          {
            text: 'To Vote:',
            fontStyle: {
              ...m.FontStyles.SMALL,
              fontWeight: FontWeights.BOLD,
            },
          },
          {
            text: 'To vote, completely fill in the oval next to your choice.',
            fontStyle: m.FontStyles.SMALL,
          },
        ],
      }),
      {
        type: 'Image',
        ...gridPoint(
          { row: (m.INSTRUCTIONS_ROW_HEIGHT - 2) / 2, column: 7.5 },
          m
        ),
        width: gridWidth(5, m),
        height: gridHeight(2, m),
        href: '/images/instructions-fill-oval.svg',
      },
      TextBlock({
        ...gridPoint({ row: 0.5, column: 13 }, m),
        width: gridWidth(13, m),
        textGroups: [
          {
            text: 'To Vote for a Write-In:',
            fontStyle: {
              ...m.FontStyles.SMALL,
              fontWeight: FontWeights.BOLD,
            },
          },
          {
            text: 'To vote for a person whose name is not on the ballot, write the person’s name on the "write-in" line and completely fill in the oval next to the line.',
            fontStyle: m.FontStyles.SMALL,
          },
        ],
      }),
      {
        type: 'Image',
        ...gridPoint(
          { row: (m.INSTRUCTIONS_ROW_HEIGHT - 1.5) / 2, column: 25.5 },
          m
        ),
        width: gridWidth(5, m),
        height: gridHeight(1.5, m),
        href: '/images/instructions-write-in.svg',
      },
    ],
  };

  return {
    type: 'Rectangle',
    ...gridPoint({ row: m.TIMING_MARKS_ROW_HEIGHT, column: 2 }, m),
    width: gridWidth(m.CONTENT_AREA_COLUMN_WIDTH, m),
    height: gridHeight(m.HEADER_AND_INSTRUCTIONS_ROW_HEIGHT, m),
    children: [header, instructions],
  };
}

function QrCode({
  x,
  y,
  width,
  height,
  qrCodeData,
  fill = 'black',
}: {
  x: number;
  y: number;
  width: number;
  height: number;
  qrCodeData: QrCodeData;
  fill?: string;
}): Rectangle {
  const moduleSize = width / qrCodeData.length + 0.1;
  return {
    type: 'Rectangle',
    x,
    y,
    width,
    height,
    children: qrCodeData.flatMap((columnData, column) =>
      columnData.map((bit, row) => ({
        type: 'Rectangle',
        x: x + column * moduleSize,
        y: y + row * moduleSize,
        width: moduleSize,
        height: moduleSize,
        fill: bit === 1 ? fill : 'white',
      }))
    ),
  };
}

function PlaceholderQrCode({
  x,
  y,
  width,
  height,
}: {
  x: number;
  y: number;
  width: number;
  height: number;
}): Rectangle {
  return {
    type: 'Rectangle',
    x,
    y,
    width,
    height,
    stroke: 'black',
    strokeWidth: 1,
  };
}

export function Footer({
  election,
  ballotStyle,
  precinct,
  pageNumber,
  totalPages,
  ballotType,
  ballotMode,
  electionHash,
  m,
}: {
  election: Election;
  ballotStyle: BallotStyle;
  precinct: Precinct;
  pageNumber: number;
  totalPages: number;
  ballotType: BallotType;
  ballotMode: BallotMode;
  electionHash?: string;
  m: Measurements;
}): Rectangle {
  const isFront = pageNumber % 2 === 1;
  const continueVotingText = isFront
    ? 'Turn ballot over and continue voting'
    : 'Continue voting on next ballot';
  const continueVotingTextWidth = textWidth(
    continueVotingText,
    m.FontStyles.H3
  );
  const arrowImageHeight = m.FOOTER_ROW_HEIGHT - 0.75;
  const continueVoting: AnyElement[] = [
    {
      type: 'TextBox',
      ...gridPoint(
        {
          row:
            m.FOOTER_ROW_HEIGHT / 2 -
            yToRow(m.FontStyles.H3.fontSize + 2, m) / 2,
          column:
            m.CONTENT_AREA_COLUMN_WIDTH -
            m.FOOTER_ROW_HEIGHT -
            xToColumn(continueVotingTextWidth, m) -
            3,
        },
        m
      ),
      width: continueVotingTextWidth + 5,
      height: gridHeight(m.FOOTER_ROW_HEIGHT, m),
      textLines: [continueVotingText],
      ...m.FontStyles.H3,
      align: 'right',
    },
    {
      type: 'Image',
      ...gridPoint(
        {
          row: (m.FOOTER_ROW_HEIGHT - arrowImageHeight) / 2,
          column: m.CONTENT_AREA_COLUMN_WIDTH - m.FOOTER_ROW_HEIGHT - 2,
        },
        m
      ),
      width: gridWidth(arrowImageHeight, m),
      height: gridHeight(arrowImageHeight, m),
      href: '/images/arrow-right-circle.svg',
    },
  ];

  const ballotCompleteText = 'You have completed voting.';
  const ballotCompleteTextWidth = textWidth(
    ballotCompleteText,
    m.FontStyles.H3
  );
  const ballotComplete: AnyElement[] = [
    {
      type: 'TextBox',
      ...gridPoint(
        {
          row:
            m.FOOTER_ROW_HEIGHT / 2 -
            yToRow(m.FontStyles.H3.fontSize + 2, m) / 2,
          column:
            m.CONTENT_AREA_COLUMN_WIDTH -
            m.FOOTER_ROW_HEIGHT -
            xToColumn(ballotCompleteTextWidth, m) -
            0.5,
        },
        m
      ),
      width: ballotCompleteTextWidth + 10,
      height: gridHeight(m.FOOTER_ROW_HEIGHT, m),
      textLines: ['You have completed voting.'],
      ...m.FontStyles.H3,
    },
  ];

  const endOfPageInstruction =
    pageNumber === totalPages ? ballotComplete : continueVoting;

  const qrCodeData = electionHash
    ? encodeMetadataInQrCode(election, {
        electionHash,
        precinctId: precinct.id,
        ballotStyleId: ballotStyle.id,
        pageNumber,
        ballotType,
        isTestMode: ballotMode !== 'official',
      })
    : encodeInQrCode(Uint8Array.of());

  return {
    type: 'Rectangle',
    ...gridPoint(
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
    children: [
      ballotMode === 'sample'
        ? PlaceholderQrCode({
            ...gridPoint({ row: 0, column: 0 }, m),
            width: gridWidth(m.FOOTER_ROW_HEIGHT, m),
            height: gridHeight(m.FOOTER_ROW_HEIGHT, m),
          })
        : QrCode({
            ...gridPoint({ row: 0, column: 0 }, m),
            width: gridWidth(m.FOOTER_ROW_HEIGHT, m),
            height: gridHeight(m.FOOTER_ROW_HEIGHT, m),
            qrCodeData,
          }),

      // Inner footer with gray background
      {
        type: 'Rectangle',
        ...gridPoint({ row: 0, column: m.FOOTER_ROW_HEIGHT + 0.5 }, m),
        width: gridWidth(
          m.CONTENT_AREA_COLUMN_WIDTH - m.FOOTER_ROW_HEIGHT - 0.5,
          m
        ),
        height: gridHeight(m.FOOTER_ROW_HEIGHT, m),
        fill: '#ededed',
        stroke: 'black',
        strokeWidth: 0.5,
        children: [
          // Thicker top border
          {
            type: 'Rectangle',
            ...gridPoint({ row: 0, column: 0 }, m),
            width: gridWidth(
              m.CONTENT_AREA_COLUMN_WIDTH - m.FOOTER_ROW_HEIGHT - 0.5,
              m
            ),
            height: 2,
            fill: 'black',
          },
          TextBlock({
            ...gridPoint({ row: m.FOOTER_ROW_HEIGHT / 8, column: 0.5 }, m),
            width: gridWidth(5, m),
            textGroups: [
              {
                text: 'Page',
                fontStyle: m.FontStyles.SMALL,
              },
              {
                text: `${pageNumber}/${totalPages}`,
                fontStyle: m.FontStyles.H2,
              },
            ],
          }),
          ...endOfPageInstruction,
        ],
      },
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
  bubblePosition,
  m,
}: {
  election: Election;
  contest: AnyContest;
  row: number;
  gridRow: number;
  gridColumn: number;
  pageNumber: number;
  bubblePosition: BubblePosition;
  m: Measurements;
}): [Rectangle, GridPosition[]] {
  assert(contest.type === 'candidate');

  const width = m.CONTEST_COLUMN_WIDTH;

  const heading = TextBlock({
    ...gridPoint({ row: m.CONTEST_PADDING, column: m.CONTEST_PADDING }, m),
    width: gridWidth(width - 2 * m.CONTEST_PADDING, m),
    textGroups: [
      {
        text: contest.title,
        fontStyle: m.FontStyles.H3,
      },
      {
        text:
          contest.seats === 1
            ? 'Vote for not more than 1'
            : `Vote for up to ${contest.seats}`,
        fontStyle: m.FontStyles.BODY,
      },
      ...(contest.seats > 1
        ? [
            {
              text: `${contest.seats} will be elected`,
              fontStyle: m.FontStyles.BODY,
            },
          ]
        : []),
      ...(contest.termDescription
        ? [
            {
              text: contest.termDescription,
              fontStyle: m.FontStyles.BODY,
            },
          ]
        : []),
    ],
  });
  const headingRowHeight = Math.round(
    yToRow(heading.height, m) + m.CONTEST_PADDING
  );

  const optionPositions: GridPosition[] = [];
  const sheetNumber = Math.ceil(pageNumber / 2);
  const side = pageNumber % 2 === 1 ? 'front' : 'back';

  const bubbleColumn = bubblePosition === 'left' ? 1 : width - 1;
  const optionLabelColumn = bubblePosition === 'left' ? 1.75 : 0.5;
  const optionTextAlign = bubblePosition;

  const options: Rectangle[] = [];
  let rowHeightUsed = headingRowHeight;
  for (const candidate of contest.candidates) {
    const partyText =
      election.type === 'primary'
        ? undefined
        : getCandidatePartiesDescription(election, candidate);
    const optionRow = rowHeightUsed;

    const optionTextBlock = TextBlock({
      ...gridPoint(
        {
          row:
            0.9 -
            yToRow(m.FontStyles.BODY.fontSize, m) / 2 -
            (partyText ? 0.15 : 0),
          column: optionLabelColumn,
        },
        m
      ),
      width: gridWidth(width - 2.25, m),
      textGroups: [
        {
          text: candidate.name,
          fontStyle: { ...m.FontStyles.BODY, fontWeight: FontWeights.BOLD },
        },
        ...(partyText
          ? [
              {
                text: partyText,
                fontStyle: {
                  ...m.FontStyles.BODY,
                  lineHeight:
                    m.FontStyles.BODY.lineHeight *
                    // Temp hack: condense line height even more for density 2
                    // so the candidate + party can fit into one grid row
                    (m.FontStyles.BODY.lineHeight === 8 ? 0.75 : 1),
                },
              },
            ]
          : []),
      ],
      align: optionTextAlign,
    });

    const optionPosition: GridPosition = {
      type: 'option',
      sheetNumber,
      side,
      contestId: contest.id,
      column: gridColumn + bubbleColumn - 1,
      row: gridRow + optionRow,
      optionId: candidate.id,
    };
    optionPositions.push(optionPosition);

    const optionRowHeight = Math.ceil(yToRow(optionTextBlock.height, m));
    options.push({
      type: 'Rectangle',
      ...gridPoint(
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
        OptionBubble({
          row: 1,
          column: bubbleColumn,
          isFilled: false,
          m,
          gridPosition: optionPosition,
        }),
        optionTextBlock,
      ],
    });

    rowHeightUsed += optionRowHeight;
  }

  if (contest.allowWriteIns) {
    for (const writeInIndex of range(0, contest.seats)) {
      const optionRow = rowHeightUsed;

      const optionPosition: GridPosition = {
        type: 'write-in',
        sheetNumber,
        side,
        contestId: contest.id,
        column: gridColumn + bubbleColumn - 1,
        row: gridRow + optionRow,
        writeInIndex,
        // This area is designed to be a rectangle that floats just above the
        // write-in line. For higher densities, we need to make sure that we
        // don't intersect with the "write-in" label text, so the height of the
        // rectangle is adjusted accordingly.
        writeInArea: {
          x: gridColumn + optionLabelColumn - 1,
          y: gridRow + optionRow - 0.25 - (m.WRITE_IN_ROW_HEIGHT - 1) / 2,
          width: width - 2,
          height: 0.45 + (m.WRITE_IN_ROW_HEIGHT - 1) / 2,
        },
      };
      optionPositions.push(optionPosition);

      options.push({
        type: 'Rectangle',
        ...gridPoint(
          {
            row: optionRow,
            column: 0,
          },
          m
        ),
        width: gridWidth(width, m),
        height: gridHeight(m.WRITE_IN_ROW_HEIGHT, m),
        children: [
          OptionBubble({
            row: 1,
            column: bubbleColumn,
            isFilled: false,
            gridPosition: optionPosition,
            m,
          }),
          {
            type: 'Rectangle', // Line?
            ...gridPoint(
              {
                row: 1.25,
                column: optionLabelColumn,
              },
              m
            ),
            width: gridWidth(width - 2.25, m),
            height: m.WRITE_IN_ROW_HEIGHT * 0.5,
            fill: 'black',
          },
          {
            type: 'TextBox',
            ...gridPoint(
              {
                row: 1.3,
                column: optionLabelColumn,
              },
              m
            ),
            width: gridWidth(width - 2.5, m),
            height: gridHeight(1, m),
            textLines: ['write-in'],
            ...m.FontStyles.SMALL,
            align: optionTextAlign,
          },
        ],
      });

      rowHeightUsed += m.WRITE_IN_ROW_HEIGHT;
    }
  }

  const contestHeight =
    gridHeight(headingRowHeight, m) +
    iter(options)
      .map((option) => option.height)
      .sum() +
    (contest.allowWriteIns ? gridHeight(2 - m.WRITE_IN_ROW_HEIGHT, m) : 0) +
    gridHeight(0.5, m);

  return [
    {
      type: 'Rectangle',
      ...gridPoint({ row, column: 0 }, m),
      width: gridWidth(width, m),
      height: contestHeight,
      stroke: 'black',
      strokeWidth: 0.5,
      children: [
        // Thicker top border
        {
          type: 'Rectangle',
          ...gridPoint({ row: 0, column: 0 }, m),
          width: gridWidth(width, m),
          height: 2,
          fill: 'black',
        },
        heading,
        ...options,
      ],
    },
    optionPositions,
  ];
}

function BallotMeasure({
  contest,
  row,
  gridRow,
  gridColumn,
  pageNumber,
  bubblePosition,
  m,
}: {
  contest: AnyContest;
  row: number;
  gridRow: number;
  gridColumn: number;
  pageNumber: number;
  bubblePosition: BubblePosition;
  m: Measurements;
}): [Rectangle, GridPosition[]] {
  assert(contest.type === 'yesno');

  const width = m.CONTENT_AREA_COLUMN_WIDTH;

  const heading = TextBlock({
    ...gridPoint({ row: m.CONTEST_PADDING, column: m.CONTEST_PADDING }, m),
    width: gridWidth(
      width -
        2 * m.CONTEST_PADDING -
        (m.BALLOT_MEASURE_OPTION_POSITION === 'inline' ? 2 : 0),
      m
    ),
    textGroups: [
      {
        text: contest.title,
        fontStyle: m.FontStyles.H3,
      },
      {
        text: contest.description,
        fontStyle: m.FontStyles.BODY,
      },
    ],
  });
  const headingRowHeight = Math.round(
    yToRow(heading.height, m) + m.CONTEST_PADDING
  );

  const optionPositions: GridPosition[] = [];
  const sheetNumber = Math.ceil(pageNumber / 2);
  const side = pageNumber % 2 === 1 ? 'front' : 'back';

  const choices = [contest.yesOption, contest.noOption];

  const bubbleColumn =
    bubblePosition === 'left'
      ? m.BALLOT_MEASURE_OPTION_POSITION === 'inline'
        ? width - 2
        : 1
      : width - 1;
  const optionLabelColumn = bubblePosition === 'left' ? 3.75 : 0;
  const optionTextAlign = bubblePosition;

  const optionRowHeight = 1;
  const options: Rectangle[] = [];
  for (const [index, choice] of choices.entries()) {
    const optionRow =
      headingRowHeight -
      (m.BALLOT_MEASURE_OPTION_POSITION === 'inline'
        ? Math.ceil((headingRowHeight + 1) / 2)
        : 0) +
      index * optionRowHeight;

    const optionPosition: GridPosition = {
      type: 'option',
      sheetNumber,
      side,
      contestId: contest.id,
      column: gridColumn + bubbleColumn - 1,
      row: gridRow + optionRow,
      optionId: choice.id,
    };
    optionPositions.push(optionPosition);

    options.push({
      type: 'Rectangle',
      ...gridPoint(
        {
          row: optionRow,
          column: bubbleColumn - 3,
        },
        m
      ),
      width: gridWidth(width, m),
      height: gridHeight(optionRowHeight, m),
      // fill: 'rgb(0, 255, 0, 0.2)',
      children: [
        OptionBubble({
          row: 1,
          column: 3,
          isFilled: false,
          gridPosition: optionPosition,
          m,
        }),
        {
          type: 'TextBox',
          ...gridPoint(
            {
              row: 0.7,
              column: optionLabelColumn,
            },
            m
          ),
          width: gridWidth(2.25, m),
          height: gridHeight(1, m),
          textLines: [choice.label],
          ...m.FontStyles.BODY,
          fontWeight: FontWeights.BOLD,
          align: optionTextAlign,
        },
      ],
    });
  }

  const optionsHeight =
    iter(options)
      .map((option) => option.height)
      .sum() + gridHeight(1, m);
  const contestHeight =
    gridHeight(Math.max(headingRowHeight, yToRow(optionsHeight, m)), m) +
    (m.BALLOT_MEASURE_OPTION_POSITION === 'inline' ? 0 : optionsHeight) +
    gridHeight(0.5, m);

  return [
    {
      type: 'Rectangle',
      ...gridPoint({ row, column: 0 }, m),
      width: gridWidth(width, m),
      height: contestHeight,
      stroke: 'black',
      strokeWidth: 0.5,
      children: [
        // Thicker top border
        {
          type: 'Rectangle',
          ...gridPoint({ row: 0, column: 0 }, m),
          width: gridWidth(width, m),
          height: 2,
          fill: 'black',
        },
        heading,
        ...options,
      ],
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
    return Math.max(...columns.map(columnHeight));
  }

  // First, try a greedy approach of filling columns to the max height
  const greedyColumns = emptyColumns();
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
  function* possibleColumns(
    columnsSoFar: Array<Column<Element>>,
    elementsLeft: Element[]
  ): Iterable<Array<Column<Element>>> {
    if (elementsLeft.length === 0) {
      yield columnsSoFar;
      return;
    }

    const [nextElement, ...restElements] = elementsLeft;

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
        yield* possibleColumns(newColumns, restElements);
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
        yield* possibleColumns(newColumns, restElements);
      }
    }
  }

  const allPossibleColumns = possibleColumns(emptyColumns(), elements);

  function spread(numbers: number[]): number {
    return Math.max(...numbers) - Math.min(...numbers);
  }
  const bestColumns = assertDefined(
    iter(allPossibleColumns).min(
      compareByScores([
        // Shortest overall height
        (columns) => heightOfTallestColumn(columns),
        // Least difference in height among columns
        (columns) => spread(columns.map(columnHeight)),
        // Least gaps (empty columns in the middle)
        (columns) => columns.findIndex((column) => column.length === 0),
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
  bubblePosition,
  m,
}: {
  election: Election;
  contests: Contests;
  gridRow: number;
  gridColumn: number;
  pageNumber: number;
  bubblePosition: BubblePosition;
  m: Measurements;
}): [Rectangle, GridPosition[]] {
  const contestPositions: GridPosition[] = [];
  const contestRectangles: Rectangle[] = [];
  let lastContestRow = 0;

  for (const contest of contests) {
    const ContestComponent =
      contest.type === 'candidate' ? CandidateContest : BallotMeasure;
    const [contestRectangle, optionPositions] = ContestComponent({
      election,
      contest,
      row: lastContestRow + m.CONTEST_ROW_MARGIN,
      gridRow: gridRow + lastContestRow + m.CONTEST_ROW_MARGIN,
      gridColumn,
      pageNumber,
      bubblePosition,
      m,
    });
    lastContestRow += yToRow(contestRectangle.height, m) + m.CONTEST_ROW_MARGIN;
    contestRectangles.push(contestRectangle);
    contestPositions.push(...optionPositions);
  }

  const column: Rectangle = {
    type: 'Rectangle',
    ...gridPoint({ row: gridRow, column: gridColumn }, m),
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
  bubblePosition,
  m,
}: {
  election: Election;
  contestColumns: Contests[];
  height: number;
  gridRow: number;
  gridColumn: number;
  pageNumber: number;
  bubblePosition: BubblePosition;
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
      bubblePosition,
      m,
    });
    columnRectangles.push(columnRectangle);
    columnPositions.push(...contestPositions);
    lastColumnColumn += xToColumn(columnRectangle.width, m) + m.GUTTER_WIDTH;
  }

  const section: Rectangle = {
    type: 'Rectangle',
    ...gridPoint({ row: 0, column: 0 }, m),
    width: gridWidth(lastColumnColumn - m.GUTTER_WIDTH, m),
    height,
    children: columnRectangles,
  };

  return [section, columnPositions];
}

export const BALLOT_MODES = ['official', 'test', 'sample'] as const;
export type BallotMode = (typeof BALLOT_MODES)[number];

export const BUBBLE_POSITIONS = ['left', 'right'] as const;
export type BubblePosition = (typeof BUBBLE_POSITIONS)[number];

export const LAYOUT_DENSITIES = [0, 1, 2] as const;
export type LayoutDensity = (typeof LAYOUT_DENSITIES)[number];

export const DEFAULT_LAYOUT_OPTIONS: LayoutOptions = {
  bubblePosition: 'left',
  layoutDensity: 0,
};

export interface LayoutOptions {
  bubblePosition: BubblePosition;
  layoutDensity: LayoutDensity;
}

export interface BallotLayout {
  precinctId: PrecinctId;
  document: Document;
  gridLayout: GridLayout;
}

interface LayOutBallotParams {
  election: Election;
  precinct: Precinct;
  ballotStyle: BallotStyle;
  ballotType: BallotType;
  ballotMode: BallotMode;
  electionHash?: string;
  layoutOptions: LayoutOptions;
  nhCustomContent: NhCustomContent;
}

function layOutBallotHelper({
  election,
  ballotStyle,
  precinct,
  ballotType,
  ballotMode,
  electionHash,
  layoutOptions,
  nhCustomContent,
}: LayOutBallotParams): BallotLayout {
  const { bubblePosition, layoutDensity } = layoutOptions;
  const m = measurements(election.ballotLayout.paperSize, layoutDensity);

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
      ballotStyle,
      precinct,
      pageNumber,
      ballotType,
      ballotMode,
      nhCustomContent,
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
          bubblePosition,
          m,
        });
        if (height > gridHeight(m.MAX_CONTEST_ROW_HEIGHT, m)) {
          throw new Error(
            `Contest is too tall to fit on a page: ${contest.title} `
          );
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
        bubblePosition,
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
      const blankText = 'This page intentionally left blank.';
      const blankTextWidth = textWidth(blankText, m.FontStyles.H2);
      contestObjects.push({
        type: 'TextBox',
        ...gridPoint(
          {
            row:
              m.TIMING_MARKS_ROW_HEIGHT +
              headerAndInstructionsRowHeight +
              contestsRowHeight / 2,
            column: m.GRID.columns / 2 - yToRow(blankTextWidth, m) / 2,
          },
          m
        ),
        width: blankTextWidth,
        height: gridHeight(2, m),
        textLines: [blankText],
        ...m.FontStyles.H2,
      });
    }

    pages.push({
      children: [
        TimingMarkGrid({ m }),
        headerAndInstructions,
        ...contestObjects,
      ].filter((child): child is AnyElement => child !== null),
    });
  }

  // Add footers once we know how many total pages there are.
  for (const [pageIndex, page] of pages.entries()) {
    page.children.push(
      Footer({
        election,
        ballotStyle,
        precinct,
        pageNumber: pageIndex + 1,
        totalPages: pages.length,
        ballotType,
        ballotMode,
        electionHash,
        m,
      })
    );
  }

  return {
    precinctId: precinct.id,
    document: {
      width: m.DOCUMENT_WIDTH,
      height: m.DOCUMENT_HEIGHT,
      pages,
    },
    gridLayout: {
      ballotStyleId: ballotStyle.id,
      optionBoundsFromTargetMark:
        bubblePosition === 'left'
          ? {
              bottom: 1,
              left: 1,
              right: 9,
              top: 1,
            }
          : {
              bottom: 1,
              left: 9,
              right: 1,
              top: 1,
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
  params: LayOutBallotParams
): Result<BallotLayout, Error> {
  try {
    return ok(layOutBallotHelper(params));
  } catch (e) {
    return wrapException(e);
  }
}

interface LayoutAllBallotStylesParams {
  election: Election;
  ballotType: BallotType;
  ballotMode: BallotMode;
  layoutOptions: LayoutOptions;
  nhCustomContent: NhCustomContentByBallotStyle;
  translatedElectionStrings: UiStringsPackage;
}

function layOutAllBallotStylesHelper({
  election,
  ballotType,
  ballotMode,
  electionHash,
  layoutOptions,
  nhCustomContent,
}: LayoutAllBallotStylesParams & { electionHash?: string }): BallotLayout[] {
  return election.ballotStyles.flatMap((ballotStyle) =>
    ballotStyle.precincts.map((precinctId) => {
      const precinct = assertDefined(getPrecinctById({ election, precinctId }));
      return layOutBallotHelper({
        election,
        precinct,
        ballotStyle,
        ballotType,
        ballotMode,
        electionHash,
        layoutOptions,
        nhCustomContent: nhCustomContent[ballotStyle.id] ?? {},
      });
    })
  );
}

/**
 * Given an election without gridLayouts, lays out all of the ballots for the
 * election (for every ballot style/precinct combo). Returns the laid out
 * ballots as well as the election definition with gridLayouts.
 *
 * We lay out the ballots once just to compute gridLayouts, add those
 * gridLayouts to the election, hash the resulting election, and then lay out
 * the ballots again with the resulting election hash (which is encoded in the
 * ballot metadata).
 */
export function layOutAllBallotStyles({
  election,
  ballotType,
  ballotMode,
  layoutOptions,
  nhCustomContent,
  translatedElectionStrings,
}: LayoutAllBallotStylesParams): Result<
  { ballots: BallotLayout[]; electionDefinition: ElectionDefinition },
  Error
> {
  try {
    const ballotStyles = election.ballotStyles.filter(
      (ballotStyle) => getContests({ election, ballotStyle }).length > 0
    );
    const electionWithRenderableBallotStyles: Election = {
      ...election,
      ballotStyles,
    };

    const gridLayoutsForAllPrecincts = layOutAllBallotStylesHelper({
      election: electionWithRenderableBallotStyles,
      ballotType,
      ballotMode,
      layoutOptions,
      nhCustomContent,
      translatedElectionStrings,
    }).map((layout) => layout.gridLayout);
    // All precincts for a given ballot style have the same grid layout
    const gridLayouts = uniqueBy(
      gridLayoutsForAllPrecincts,
      (layout) => layout.ballotStyleId
    );

    const electionWithGridLayouts: Election = {
      ...electionWithRenderableBallotStyles,
      gridLayouts,
    };

    const cdfElection = convertVxfElectionToCdfBallotDefinition(
      electionWithGridLayouts,
      translatedElectionStrings
    );

    const electionDefinition = safeParseElectionDefinition(
      JSON.stringify(cdfElection, null, 2)
    ).unsafeUnwrap();

    return ok({
      ballots: layOutAllBallotStylesHelper({
        election: electionDefinition.election,
        ballotType,
        ballotMode,
        electionHash: electionDefinition.electionHash,
        layoutOptions,
        nhCustomContent,
        translatedElectionStrings,
      }),
      electionDefinition,
    });
  } catch (e) {
    return wrapException(e);
  }
}
