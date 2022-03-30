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
import { assert, groupBy, zip } from '@votingworks/utils';
import { sha256 } from 'js-sha256';
import { DateTime } from 'luxon';
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
import { BackMarksMetadataSchema, FrontMarksMetadataSchema } from './types';

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
 * Pairs entries by column and row, ignoring the absolute values of the columns
 * and rows. There must be the same number of columns in both, and for each
 * column pair there must be the same number of rows in both.
 */
export function pairColumnEntries<T extends GridEntry, U extends GridEntry>(
  grid1: readonly T[],
  grid2: readonly U[]
): Array<[T, U]> {
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

  for (const [column1, column2] of zip(grid1Columns, grid2Columns)) {
    for (const [entry1, entry2] of zip(column1, column2)) {
      pairs.push([entry1, entry2]);
    }
  }

  return pairs;
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
 * Creates an election definition only from the ballot metadata, ignoring the
 * ballot images.
 */
export function convertElectionDefinitionHeader(
  definition: NewHampshireBallotCardDefinition['definition']
): Result<Election, Error> {
  const root = definition;
  const accuvoteHeaderInfo = root.getElementsByTagName('AccuvoteHeaderInfo')[0];
  const electionId =
    accuvoteHeaderInfo?.getElementsByTagName('ElectionID')[0]?.textContent;
  if (typeof electionId !== 'string') {
    return err(new Error('ElectionID is required'));
  }

  const title =
    accuvoteHeaderInfo?.getElementsByTagName('ElectionName')[0]?.textContent;
  if (typeof title !== 'string') {
    return err(new Error('ElectionName is required'));
  }

  const townName =
    accuvoteHeaderInfo?.getElementsByTagName('TownName')[0]?.textContent;
  if (typeof townName !== 'string') {
    return err(new Error('TownName is required'));
  }

  const townId =
    accuvoteHeaderInfo?.getElementsByTagName('TownID')[0]?.textContent;
  if (typeof townId !== 'string') {
    return err(new Error('TownID is required'));
  }

  const rawDate =
    accuvoteHeaderInfo?.getElementsByTagName('ElectionDate')[0]?.textContent;
  if (typeof rawDate !== 'string') {
    return err(new Error('ElectionDate is required'));
  }

  const parsedDate = DateTime.fromFormat(rawDate.trim(), 'M/d/yyyy HH:mm:ss', {
    locale: 'en-US',
    zone: 'America/New_York',
  });
  if (parsedDate.invalidReason) {
    return err(new Error(`invalid date: ${parsedDate.invalidReason}`));
  }

  const rawPrecinctId = root.getElementsByTagName('PrecinctID')[0]?.textContent;
  if (typeof rawPrecinctId !== 'string') {
    return err(new Error('PrecinctID is required'));
  }
  const cleanedPrecinctId = rawPrecinctId.replace(/[^-_\w]/g, '');
  const precinctId = `town-id-${townId}-precinct-id-${cleanedPrecinctId}`;

  const districtIdResult = safeParse(
    DistrictIdSchema,
    `town-id-${townId}-precinct-id-${cleanedPrecinctId}`
  );
  if (districtIdResult.isErr()) {
    return districtIdResult;
  }
  const districtId = districtIdResult.ok();

  const ballotSize = root.getElementsByTagName('BallotSize')[0]?.textContent;
  if (typeof ballotSize !== 'string') {
    return err(new Error('BallotSize is required'));
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
      return err(new Error(`invalid ballot size: ${ballotSize}`));
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
      return err(new Error('OfficeName is required'));
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
        return err(
          new Error(`Name is missing in candidate ${i + 1} of ${officeName}`)
        );
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

  return safeParseElection(election);
}

/**
 * Convert New Hampshire XML files to a single {@link Election} object.
 */
export function convertElectionDefinition(
  cardDefinition: NewHampshireBallotCardDefinition,
  { ovalTemplate, debug }: { ovalTemplate: ImageData; debug?: Debugger }
): Result<Election, Error> {
  const convertHeaderResult = convertElectionDefinitionHeader(
    cardDefinition.definition
  );

  if (convertHeaderResult.isErr()) {
    return convertHeaderResult;
  }

  const paperSize = convertHeaderResult.ok().ballotLayout?.paperSize;

  if (!paperSize) {
    return err(new Error('paper size is missing'));
  }

  const expectedCardGeometry = getTemplateBallotCardGeometry(paperSize);
  debug?.layer('front page');
  const cardDefinitionFront = convertToGrayscale(cardDefinition.front);
  const frontTimingMarks = findBallotTimingMarks(cardDefinitionFront, {
    geometry: expectedCardGeometry,
    debug,
  });
  debug?.layerEnd('front page');

  if (!frontTimingMarks) {
    return err(new Error('no timing marks found on front'));
  }

  debug?.layer('back page');
  const cardDefinitionBack = convertToGrayscale(cardDefinition.back);
  const backTimingMarks = findBallotTimingMarks(cardDefinitionBack, {
    geometry: expectedCardGeometry,
    debug,
  });
  debug?.layerEnd('back page');

  if (!backTimingMarks) {
    return err(new Error('no timing marks found on back'));
  }

  const frontBits = decodeBottomRowTimingMarks(frontTimingMarks)?.reverse();

  if (!frontBits) {
    return err(
      new Error('could not read bottom timing marks on front as bits')
    );
  }

  const backBits = decodeBottomRowTimingMarks(backTimingMarks)?.reverse();

  if (!backBits) {
    return err(new Error('could not read bottom timing marks on back as bits'));
  }

  const frontMetadataResult = safeParse(
    FrontMarksMetadataSchema,
    decodeFrontTimingMarkBits(frontBits)
  );

  if (frontMetadataResult.isErr()) {
    return frontMetadataResult;
  }

  const frontMetadata = frontMetadataResult.ok();

  const backMetadataResult = safeParse(
    BackMarksMetadataSchema,
    decodeBackTimingMarkBits(backBits)
  );

  if (backMetadataResult.isErr()) {
    return backMetadataResult;
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

  const mergedGrids = pairColumnEntries(
    gridLayout.gridPositions.map<GridPosition>((gridPosition) => {
      return {
        ...gridPosition,
      };
    }),
    ovalGrid
  );

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
