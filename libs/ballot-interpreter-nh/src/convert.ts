import {
  AdjudicationReason,
  BallotPaperSize,
  BallotTargetMarkPosition,
  Candidate,
  CandidateContest,
  DistrictIdSchema,
  Election,
  err,
  GridPosition,
  GridPositionOption,
  GridPositionWriteIn,
  ok,
  Party,
  PartyIdSchema,
  Result,
  safeParse,
  safeParseElection,
  safeParseNumber,
  unsafeParse,
  YesNoContest,
} from '@votingworks/types';
import { assert, groupBy, throwIllegalValue, zip } from '@votingworks/utils';
import { sha256 } from 'js-sha256';
import { DateTime } from 'luxon';
import { ZodError } from 'zod';
import {
  decodeBackTimingMarkBits,
  decodeFrontTimingMarkBits,
  findTemplateOvals,
  getTemplateBallotCardGeometry,
  TemplateOval,
} from './accuvote';
import { Debugger } from './debug';
import { convertToGrayscale } from './images';
import { DefaultMarkThresholds } from './interpret';
import { findBallotTimingMarks } from './interpret/find_ballot_timing_marks';
import {
  decodeBottomRowTimingMarks,
  interpolateMissingTimingMarks,
} from './timing_marks';
import {
  BackMarksMetadataSchema,
  Bit,
  FrontMarksMetadataSchema,
  PartialTimingMarks,
  Size,
} from './types';

export { interpret } from './interpret';

function makeId(text: string): string {
  const hash = sha256(text);
  return `${text.replace(/[^-_a-z\d+]+/gi, '-')}-${hash.substr(0, 8)}`;
}

const ElectionDefinitionVerticalTimingMarkDistance = 9;
const ElectionDefinitionHorizontalTimingMarkDistance = 108 / 7;
const ElectionDefinitionOriginX =
  236.126 - ElectionDefinitionHorizontalTimingMarkDistance * 12;
const ElectionDefinitionOriginY =
  245.768 - ElectionDefinitionVerticalTimingMarkDistance * 9;

function timingMarkCoordinatesFromOxOy(
  ox: number,
  oy: number
): { column: number; row: number } {
  return {
    column: Math.round(
      (ox - ElectionDefinitionOriginX) /
        ElectionDefinitionHorizontalTimingMarkDistance
    ),
    row: Math.round(
      (oy - ElectionDefinitionOriginY) /
        ElectionDefinitionVerticalTimingMarkDistance
    ),
  };
}

/**
 * Basic properties for an object located on a grid.
 */
export interface GridEntry {
  readonly side: 'front' | 'back';
  readonly column: number;
  readonly row: number;
}

function compareGridEntry(a: GridEntry, b: GridEntry): number {
  if (a.side !== b.side) {
    return a.side === 'front' ? -1 : 1;
  }
  return a.row - b.row;
}

/**
 * The kinds of errors that can occur during `pairColumnEntries`.
 */
export enum PairColumnEntriesErrorKind {
  ColumnCountMismatch = 'ColumnCountMismatch',
  ColumnEntryCountMismatch = 'ColumnEntryCountMismatch',
}

/**
 * Errors that can occur during `pairColumnEntries`.
 */
export type PairColumnEntriesError =
  | {
      kind: PairColumnEntriesErrorKind.ColumnCountMismatch;
      message: string;
      columnCounts: [number, number];
    }
  | {
      kind: PairColumnEntriesErrorKind.ColumnEntryCountMismatch;
      message: string;
      columnIndex: number;
      columnEntryCounts: [number, number];
    };

/**
 * Pairs entries by column and row, ignoring the absolute values of the columns
 * and rows. There must be the same number of columns in both, and for each
 * column pair there must be the same number of rows in both.
 */
export function pairColumnEntries<T extends GridEntry, U extends GridEntry>(
  grid1: readonly T[],
  grid2: readonly U[]
): Result<Array<[T, U]>, PairColumnEntriesError> {
  const grid1ByColumn = groupBy(grid1, (e) => e.column);
  const grid2ByColumn = groupBy(grid2, (e) => e.column);
  const grid1Columns = Array.from(grid1ByColumn.entries())
    // sort by column
    .sort((a, b) => a[0] - b[0])
    // sort by side, row
    .map(([, entries]) => Array.from(entries).sort(compareGridEntry));
  const grid2Columns = Array.from(grid2ByColumn.entries())
    // sort by column
    .sort((a, b) => a[0] - b[0])
    // sort by side, row
    .map(([, entries]) => Array.from(entries).sort(compareGridEntry));
  const pairs: Array<[T, U]> = [];

  if (grid1Columns.length !== grid2Columns.length) {
    return err({
      kind: PairColumnEntriesErrorKind.ColumnCountMismatch,
      message: `Grids have different number of columns: ${grid1Columns.length} vs ${grid2Columns.length}`,
      columnCounts: [grid1Columns.length, grid2Columns.length],
    });
  }

  let columnIndex = 0;
  for (const [column1, column2] of zip(grid1Columns, grid2Columns)) {
    if (column1.length !== column2.length) {
      return err({
        kind: PairColumnEntriesErrorKind.ColumnEntryCountMismatch,
        message: `Columns at index ${columnIndex} disagree on entry count: grid #1 has ${column1.length} entries, but grid #2 has ${column2.length} entries`,
        columnIndex,
        columnEntryCounts: [column1.length, column2.length],
      });
    }
    for (const [entry1, entry2] of zip(column1, column2)) {
      pairs.push([entry1, entry2]);
    }
    columnIndex += 1;
  }

  return ok(pairs);
}

/**
 * Contains the metadata and ballot images for a ballot card.
 */
export interface NewHampshireBallotCardDefinition {
  /**
   * XML element containing the ballot card definition, including election info
   * and contests with candidates.
   */
  readonly definition: Element;

  /**
   * An image of the ballot card's front as rendered from a PDF.
   */
  readonly front: ImageData;

  /**
   * An image of the ballot card's back as rendered from a PDF.
   */
  readonly back: ImageData;
}

/**
 * Contains candidate elements and their LCM column/row coordinates.
 */
export interface CandidateGridElement {
  readonly element: Element;
  readonly column: number;
  readonly row: number;
}

/**
 * Finds all candidates and arranges them in a LCM grid.
 */
export function readGridFromElectionDefinition(
  root: Element
): CandidateGridElement[] {
  return Array.from(root.getElementsByTagName('CandidateName')).map(
    (candidateElement) => {
      const ox = safeParseNumber(
        candidateElement.getElementsByTagName('OX')[0]?.textContent
      ).unsafeUnwrap();
      const oy = safeParseNumber(
        candidateElement.getElementsByTagName('OY')[0]?.textContent
      ).unsafeUnwrap();
      const { column, row } = timingMarkCoordinatesFromOxOy(ox, oy);
      return { element: candidateElement, column, row };
    }
  );
}

/**
 * Kinds of errors that can occur when converting a ballot card definition.
 */
export enum ConvertErrorKind {
  ElectionValidationFailed = 'ElectionValidationFailed',
  InvalidBallotSize = 'InvalidBallotSize',
  InvalidDistrictId = 'InvalidDistrictId',
  InvalidElectionDate = 'InvalidElectionDate',
  InvalidTimingMarkMetadata = 'InvalidTimingMarkMetadata',
  MismatchedBallotImageSize = 'MismatchedBallotImageSize',
  MismatchedOvalGrids = 'MismatchedOvalGrids',
  MissingDefinitionProperty = 'MissingDefinitionProperty',
  MissingTimingMarkMetadata = 'MissingTimingMarkMetadata',
  TimingMarkDetectionFailed = 'TimingMarkDetectionFailed',
}

/**
 * Errors that can occur when converting a ballot card definition.
 */
export type ConvertError =
  | {
      kind: ConvertErrorKind.ElectionValidationFailed;
      message: string;
      validationError: ZodError;
    }
  | {
      kind: ConvertErrorKind.InvalidBallotSize;
      message: string;
      invalidBallotSize: string;
    }
  | {
      kind: ConvertErrorKind.InvalidDistrictId;
      message: string;
      invalidDistrictId: string;
    }
  | {
      kind: ConvertErrorKind.InvalidElectionDate;
      message: string;
      invalidDate: string;
      invalidReason: string;
    }
  | {
      kind: ConvertErrorKind.InvalidTimingMarkMetadata;
      message: string;
      side: 'front' | 'back';
      timingMarks: PartialTimingMarks;
      timingMarkBits: readonly Bit[];
      validationError: ZodError;
    }
  | {
      kind: ConvertErrorKind.MismatchedBallotImageSize;
      message: string;
      side: 'front' | 'back';
      ballotPaperSize: BallotPaperSize;
      expectedImageSize: Size;
      actualImageSize: Size;
    }
  | {
      kind: ConvertErrorKind.MismatchedOvalGrids;
      message: string;
      pairColumnEntriesError: PairColumnEntriesError;
    }
  | {
      kind: ConvertErrorKind.MissingDefinitionProperty;
      message: string;
      property: string;
    }
  | {
      kind: ConvertErrorKind.MissingTimingMarkMetadata;
      message: string;
      side: 'front' | 'back';
      timingMarks: PartialTimingMarks;
    }
  | {
      kind: ConvertErrorKind.TimingMarkDetectionFailed;
      message: string;
      side: 'front' | 'back';
    };

/**
 * Creates an election definition only from the ballot metadata, ignoring the
 * ballot images.
 */
export function convertElectionDefinitionHeader(
  definition: NewHampshireBallotCardDefinition['definition']
): Result<Election, ConvertError> {
  const root = definition;
  const accuvoteHeaderInfo = root.getElementsByTagName('AccuvoteHeaderInfo')[0];
  const electionId =
    accuvoteHeaderInfo?.getElementsByTagName('ElectionID')[0]?.textContent;
  if (typeof electionId !== 'string') {
    return err({
      kind: ConvertErrorKind.MissingDefinitionProperty,
      message: 'ElectionID is missing',
      property: 'AVSInterface > AccuvoteHeaderInfo > ElectionID',
    });
  }

  const title =
    accuvoteHeaderInfo?.getElementsByTagName('ElectionName')[0]?.textContent;
  if (typeof title !== 'string') {
    return err({
      kind: ConvertErrorKind.MissingDefinitionProperty,
      message: 'ElectionName is missing',
      property: 'AVSInterface > AccuvoteHeaderInfo > ElectionName',
    });
  }

  const townName =
    accuvoteHeaderInfo?.getElementsByTagName('TownName')[0]?.textContent;
  if (typeof townName !== 'string') {
    return err({
      kind: ConvertErrorKind.MissingDefinitionProperty,
      message: 'TownName is missing',
      property: 'AVSInterface > AccuvoteHeaderInfo > TownName',
    });
  }

  const townId =
    accuvoteHeaderInfo?.getElementsByTagName('TownID')[0]?.textContent;
  if (typeof townId !== 'string') {
    return err({
      kind: ConvertErrorKind.MissingDefinitionProperty,
      message: 'TownID is missing',
      property: 'AVSInterface > AccuvoteHeaderInfo > TownID',
    });
  }

  const rawDate =
    accuvoteHeaderInfo?.getElementsByTagName('ElectionDate')[0]?.textContent;
  if (typeof rawDate !== 'string') {
    return err({
      kind: ConvertErrorKind.MissingDefinitionProperty,
      message: 'ElectionDate is missing',
      property: 'AVSInterface > AccuvoteHeaderInfo > ElectionDate',
    });
  }

  const parsedDate = DateTime.fromFormat(rawDate.trim(), 'M/d/yyyy HH:mm:ss', {
    locale: 'en-US',
    zone: 'America/New_York',
  });
  if (parsedDate.invalidReason) {
    return err({
      kind: ConvertErrorKind.InvalidElectionDate,
      message: `invalid date: ${parsedDate.invalidReason}`,
      invalidDate: rawDate,
      invalidReason: parsedDate.invalidReason,
    });
  }

  const rawPrecinctId = root.getElementsByTagName('PrecinctID')[0]?.textContent;
  if (typeof rawPrecinctId !== 'string') {
    return err({
      kind: ConvertErrorKind.MissingDefinitionProperty,
      message: 'PrecinctID is missing',
      property: 'AVSInterface > AccuvoteHeaderInfo > PrecinctID',
    });
  }
  const cleanedPrecinctId = rawPrecinctId.replace(/[^-_\w]/g, '');
  const precinctId = `town-id-${townId}-precinct-id-${cleanedPrecinctId}`;

  const rawDistrictId = `town-id-${townId}-precinct-id-${cleanedPrecinctId}`;
  const districtIdResult = safeParse(DistrictIdSchema, rawDistrictId);
  if (districtIdResult.isErr()) {
    return err({
      kind: ConvertErrorKind.InvalidDistrictId,
      message: `Invalid district ID "${rawDistrictId}": ${
        districtIdResult.err().message
      }`,
      invalidDistrictId: rawDistrictId,
    });
  }
  const districtId = districtIdResult.ok();

  const ballotSize = root.getElementsByTagName('BallotSize')[0]?.textContent;
  if (typeof ballotSize !== 'string') {
    return err({
      kind: ConvertErrorKind.MissingDefinitionProperty,
      message: 'BallotSize is missing',
      property: 'AVSInterface > AccuvoteHeaderInfo > BallotSize',
    });
  }
  let paperSize: BallotPaperSize;
  switch (ballotSize) {
    case '8.5X11':
      paperSize = BallotPaperSize.Letter;
      break;

    case '8.5X14':
      paperSize = BallotPaperSize.Legal;
      break;

    default:
      return err({
        kind: ConvertErrorKind.InvalidBallotSize,
        message: `invalid ballot size: ${ballotSize}`,
        invalidBallotSize: ballotSize,
      });
  }
  const geometry = getTemplateBallotCardGeometry(paperSize);

  const parties = new Map<string, Party>();
  const contests: Array<CandidateContest | YesNoContest> = [];
  const optionMetadataByCandidateElement = new Map<
    Element,
    | Omit<GridPositionOption, 'row' | 'column' | 'side'>
    | Omit<GridPositionWriteIn, 'row' | 'column' | 'side'>
  >();

  for (const contestElement of Array.from(
    root.getElementsByTagName('Candidates')
  )) {
    const officeNameElement =
      contestElement.getElementsByTagName('OfficeName')[0];
    const officeName =
      officeNameElement?.getElementsByTagName('Name')[0]?.textContent;
    if (typeof officeName !== 'string') {
      return err({
        kind: ConvertErrorKind.MissingDefinitionProperty,
        message: 'OfficeName is missing',
        property: 'AVSInterface > Candidates > OfficeName > Name',
      });
    }
    const contestId = makeId(officeName);

    const winnerNote =
      officeNameElement?.getElementsByTagName('WinnerNote')[0]?.textContent;
    const seats =
      safeParseNumber(
        winnerNote?.match(/Vote for not more than (\d+)/)?.[1]
      ).ok() ?? 1;

    let writeInIndex = 0;
    const candidates: Candidate[] = [];
    for (const [i, candidateElement] of Array.from(
      contestElement.getElementsByTagName('CandidateName')
    ).entries()) {
      const candidateName =
        candidateElement.getElementsByTagName('Name')[0]?.textContent;
      if (typeof candidateName !== 'string') {
        return err({
          kind: ConvertErrorKind.MissingDefinitionProperty,
          message: `Name is missing in candidate ${i + 1} of ${officeName}`,
          property: 'AVSInterface > Candidates > CandidateName > Name',
        });
      }

      let party: Party | undefined;
      const partyName =
        candidateElement?.getElementsByTagName('Party')[0]?.textContent;
      if (partyName) {
        party = parties.get(partyName);
        if (!party) {
          const partyId = makeId(partyName);
          party = {
            id: unsafeParse(PartyIdSchema, partyId),
            name: partyName,
            fullName: partyName,
            abbrev: partyName,
          };
          parties.set(partyName, party);
        }
      }

      const isWriteIn =
        candidateElement?.getElementsByTagName('WriteIn')[0]?.textContent ===
        'True';

      if (!isWriteIn) {
        const candidateId = makeId(candidateName);
        const candidate: Candidate = {
          id: candidateId,
          name: candidateName,
          partyId: party?.id,
        };
        candidates.push(candidate);
        optionMetadataByCandidateElement.set(candidateElement, {
          type: 'option',
          contestId,
          optionId: candidateId,
        });
      } else {
        optionMetadataByCandidateElement.set(candidateElement, {
          type: 'write-in',
          contestId,
          writeInIndex,
        });
        writeInIndex += 1;
      }
    }

    contests.push({
      type: 'candidate',
      id: contestId,
      title: officeName,
      section: officeName,
      districtId,
      seats,
      allowWriteIns: writeInIndex > 0,
      candidates,
      // TODO: party ID?
    });
  }

  const definitionGrid = readGridFromElectionDefinition(root);

  const election: Election = {
    title,
    date: parsedDate.toISO(),
    county: {
      id: townId,
      name: townName,
    },
    state: 'NH',
    parties: Array.from(parties.values()),
    precincts: [
      {
        id: precinctId,
        name: townName,
      },
    ],
    districts: [
      {
        id: districtId,
        name: townName,
      },
    ],
    ballotStyles: [
      {
        id: 'default',
        districts: [districtId],
        precincts: [precinctId],
      },
    ],
    contests,
    ballotLayout: {
      paperSize,
      targetMarkPosition: BallotTargetMarkPosition.Right,
    },
    markThresholds: DefaultMarkThresholds,
    gridLayouts: [
      {
        precinctId,
        ballotStyleId: 'default',
        columns: geometry.gridSize.width,
        rows: geometry.gridSize.height,
        gridPositions: definitionGrid.map(({ element, column, row }) => {
          const metadata = optionMetadataByCandidateElement.get(element);
          assert(metadata, `metadata missing for column=${column} row=${row}`);
          return metadata.type === 'option'
            ? {
                type: 'option',
                side: 'front',
                column,
                row,
                contestId: metadata.contestId,
                optionId: metadata.optionId,
              }
            : {
                type: 'write-in',
                side: 'front',
                column,
                row,
                contestId: metadata.contestId,
                writeInIndex: metadata.writeInIndex,
              };
        }),
      },
    ],
    centralScanAdjudicationReasons: [
      AdjudicationReason.UninterpretableBallot,
      AdjudicationReason.Overvote,
      AdjudicationReason.MarkedWriteIn,
      AdjudicationReason.BlankBallot,
    ],
    precinctScanAdjudicationReasons: [
      AdjudicationReason.UninterpretableBallot,
      AdjudicationReason.Overvote,
      AdjudicationReason.BlankBallot,
    ],
    // eslint-disable-next-line vx/gts-identifiers
    sealURL: '/seals/Seal_of_New_Hampshire.svg',
  };

  const parseElectionResult = safeParseElection(election);

  if (parseElectionResult.isErr()) {
    return err({
      kind: ConvertErrorKind.ElectionValidationFailed,
      message: parseElectionResult.err().message,
      validationError: parseElectionResult.err(),
    });
  }

  return parseElectionResult;
}

/**
 * Convert New Hampshire XML files to a single {@link Election} object.
 */
export function convertElectionDefinition(
  cardDefinition: NewHampshireBallotCardDefinition,
  { ovalTemplate, debug }: { ovalTemplate: ImageData; debug?: Debugger }
): Result<Election, ConvertError> {
  const convertHeaderResult = convertElectionDefinitionHeader(
    cardDefinition.definition
  );

  if (convertHeaderResult.isErr()) {
    return convertHeaderResult;
  }

  const paperSize = convertHeaderResult.ok().ballotLayout?.paperSize;
  assert(
    paperSize,
    'paperSize should always be set in convertElectionDefinitionHeader'
  );

  const expectedCardGeometry = getTemplateBallotCardGeometry(paperSize);

  for (const [side, imageData] of [
    ['front', cardDefinition.front],
    ['back', cardDefinition.back],
  ] as const) {
    if (
      imageData.width !== expectedCardGeometry.canvasSize.width ||
      imageData.height !== expectedCardGeometry.canvasSize.height
    ) {
      return err({
        kind: ConvertErrorKind.MismatchedBallotImageSize,
        message: `Ballot image size mismatch: XML definition is ${paperSize}-size, or ${expectedCardGeometry.canvasSize.width}x${expectedCardGeometry.canvasSize.height}, but ${side} image is ${imageData.width}x${imageData.height}`,
        side,
        ballotPaperSize: paperSize,
        expectedImageSize: expectedCardGeometry.canvasSize,
        actualImageSize: { width: imageData.width, height: imageData.height },
      });
    }
  }

  debug?.layer('front page');
  const cardDefinitionFront = convertToGrayscale(cardDefinition.front);
  const frontTimingMarks = findBallotTimingMarks(cardDefinitionFront, {
    geometry: expectedCardGeometry,
    debug,
  });
  debug?.layerEnd('front page');

  if (!frontTimingMarks) {
    return err({
      kind: ConvertErrorKind.TimingMarkDetectionFailed,
      message: 'no timing marks found on front',
      side: 'front',
    });
  }

  debug?.layer('back page');
  const cardDefinitionBack = convertToGrayscale(cardDefinition.back);
  const backTimingMarks = findBallotTimingMarks(cardDefinitionBack, {
    geometry: expectedCardGeometry,
    debug,
  });
  debug?.layerEnd('back page');

  if (!backTimingMarks) {
    return err({
      kind: ConvertErrorKind.TimingMarkDetectionFailed,
      message: 'no timing marks found on back',
      side: 'back',
    });
  }

  const frontBits = decodeBottomRowTimingMarks(frontTimingMarks)?.reverse();

  if (!frontBits) {
    return err({
      kind: ConvertErrorKind.MissingTimingMarkMetadata,
      message: 'could not read bottom timing marks on front as bits',
      side: 'front',
      timingMarks: frontTimingMarks,
    });
  }

  const backBits = decodeBottomRowTimingMarks(backTimingMarks)?.reverse();

  if (!backBits) {
    return err({
      kind: ConvertErrorKind.MissingTimingMarkMetadata,
      message: 'could not read bottom timing marks on back as bits',
      side: 'back',
      timingMarks: backTimingMarks,
    });
  }

  const frontMetadataResult = safeParse(
    FrontMarksMetadataSchema,
    decodeFrontTimingMarkBits(frontBits)
  );

  if (frontMetadataResult.isErr()) {
    return err({
      kind: ConvertErrorKind.InvalidTimingMarkMetadata,
      message: `could not parse front timing mark metadata: ${
        frontMetadataResult.err().message
      }`,
      side: 'front',
      timingMarks: frontTimingMarks,
      timingMarkBits: frontBits,
      validationError: frontMetadataResult.err(),
    });
  }

  const frontMetadata = frontMetadataResult.ok();

  const backMetadataResult = safeParse(
    BackMarksMetadataSchema,
    decodeBackTimingMarkBits(backBits)
  );

  if (backMetadataResult.isErr()) {
    return err({
      kind: ConvertErrorKind.InvalidTimingMarkMetadata,
      message: `could not parse back timing mark metadata: ${
        backMetadataResult.err().message
      }`,
      side: 'back',
      timingMarks: backTimingMarks,
      timingMarkBits: backBits,
      validationError: backMetadataResult.err(),
    });
  }

  const ballotStyleId = `card-number-${frontMetadata.cardNumber}`;

  const frontCompleteTimingMarks =
    interpolateMissingTimingMarks(frontTimingMarks);
  const backCompleteTimingMarks =
    interpolateMissingTimingMarks(backTimingMarks);

  const frontTemplateOvals = findTemplateOvals(
    cardDefinitionFront,
    ovalTemplate,
    frontCompleteTimingMarks,
    { usableArea: expectedCardGeometry.frontUsableArea, debug }
  );
  const backTemplateOvals = findTemplateOvals(
    cardDefinitionBack,
    ovalTemplate,
    backCompleteTimingMarks,
    { usableArea: expectedCardGeometry.backUsableArea, debug }
  );

  const election = convertHeaderResult.ok();
  const gridLayout = election.gridLayouts?.[0];
  assert(gridLayout, 'grid layout missing');

  const ballotStyle = election.ballotStyles[0];
  assert(ballotStyle, 'ballot style missing');

  type TemplateOvalGridEntry = TemplateOval & { side: 'front' | 'back' };
  const ovalGrid = [
    ...frontTemplateOvals.map<TemplateOvalGridEntry>((oval) => ({
      ...oval,
      side: 'front',
    })),
    ...backTemplateOvals.map<TemplateOvalGridEntry>((oval) => ({
      ...oval,
      side: 'back',
    })),
  ];

  const pairColumnEntriesResult = pairColumnEntries(
    gridLayout.gridPositions.map<GridPosition>((gridPosition) => ({
      ...gridPosition,
    })),
    ovalGrid
  );

  if (pairColumnEntriesResult.isErr()) {
    const pairColumnEntriesError = pairColumnEntriesResult.err();

    switch (pairColumnEntriesError.kind) {
      case PairColumnEntriesErrorKind.ColumnCountMismatch:
        return err({
          kind: ConvertErrorKind.MismatchedOvalGrids,
          message: `XML definition and ballot images have different number of columns containing ovals: ${pairColumnEntriesError.columnCounts[0]} vs ${pairColumnEntriesError.columnCounts[1]}`,
          pairColumnEntriesError,
        });

      case PairColumnEntriesErrorKind.ColumnEntryCountMismatch:
        return err({
          kind: ConvertErrorKind.MismatchedOvalGrids,
          message: `XML definition and ballot images have different number of entries in column ${pairColumnEntriesError.columnIndex}: ${pairColumnEntriesError.columnEntryCounts[0]} vs ${pairColumnEntriesError.columnEntryCounts[1]}`,
          pairColumnEntriesError,
        });

      default:
        throwIllegalValue(pairColumnEntriesError, 'kind');
    }
  }

  const mergedGrids = pairColumnEntriesResult.ok();
  const result: Election = {
    ...election,
    ballotStyles: [
      {
        ...ballotStyle,
        id: ballotStyleId,
      },
    ],
    gridLayouts: [
      {
        ...gridLayout,
        ballotStyleId,
        gridPositions: mergedGrids.map(([definition, oval]) => ({
          ...definition,
          side: oval.side,
          column: oval.column,
          row: oval.row,
        })),
      },
    ],
  };

  return ok(result);
}
