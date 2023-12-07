import { sliceElectionHash } from '@votingworks/ballot-encoder';
import {
  Result,
  throwIllegalValue,
  typedAs,
  assert,
  find,
  iter,
  ok,
  Ok,
} from '@votingworks/basics';
import { loadImageData } from '@votingworks/image-utils';
import {
  BallotMetadata,
  BallotType,
  ElectionDefinition,
  InvalidElectionHashPage,
  InvalidPrecinctPage,
  InvalidTestModePage,
  mapSheet,
  PageInterpretation,
  PrecinctSelection,
  SheetOf,
  AdjudicationInfo,
  AnyContest,
  BallotPageContestLayout,
  BallotPageContestOptionLayout,
  BallotTargetMark,
  ContestOption,
  Contests,
  Corners,
  getBallotStyle,
  GridPosition,
  HmpbBallotPageMetadata,
  InterpretedHmpbPage,
  MarkInfo,
  MarkStatus,
  Rect,
  WriteInAreaStatus,
  WriteInId,
  MarkThresholds,
  AdjudicationReason,
  PageInterpretationWithFiles,
  Id,
} from '@votingworks/types';
import {
  ALL_PRECINCTS_SELECTION,
  time,
  allContestOptions,
  convertMarksToVotesDict,
} from '@votingworks/utils';
import makeDebug from 'debug';
import {
  interpret as interpretHmpbBallotSheetRust,
  BallotPageTimingMarkMetadataFront,
  Geometry,
  InterpretedBallotCard,
  HmpbInterpretResult as NextInterpretResult,
  Rect as NextRect,
  InterpretedContestLayout,
  InterpretedContestOptionLayout,
  ScoredPositionArea,
  ScoredBubbleMarks,
  ScoredBubbleMark,
} from './hmpb-ts';
import { interpret as interpretVxBmdBallotSheet } from './bmd';
import { getAllPossibleAdjudicationReasons } from './adjudication_reasons';
import { saveSheetImage } from './save_images';

const debug = makeDebug('ballot-interpreter:scan:interpreter');

/**
 * Options for interpreting a sheet of ballot images.
 */
export interface InterpreterOptions {
  electionDefinition: ElectionDefinition;
  precinctSelection: PrecinctSelection;
  testMode: boolean;
  markThresholds: MarkThresholds;
  adjudicationReasons: readonly AdjudicationReason[];
}

/**
 * Result of interpreting a sheet of ballot images.
 */
export type InterpretResult = Result<SheetOf<InterpretFileResult>, Error>;

/**
 * Result of interpreting a single ballot image.
 */
export interface InterpretFileResult {
  interpretation: PageInterpretation;
  normalizedImage: ImageData;
}

/**
 * Conversion intermediary for marks containing the grid position, associated
 * contest option, the mark score, and the write-in area score if applicable.
 */
interface ScoredContestOption {
  option: ContestOption;
  gridPosition: GridPosition;
  scoredMark: ScoredBubbleMark;
  markStatus: MarkStatus;
  scoredWriteInArea?: ScoredPositionArea;
  writeInAreaStatus: WriteInAreaStatus;
}

type OkType<T> = T extends Ok<infer U> ? U : never;

function getContestOptionForGridPosition(
  contests: Contests,
  gridPosition: GridPosition
): ContestOption {
  const contest = find(contests, (c) => c.id === gridPosition.contestId);
  const option = iter(allContestOptions(contest)).find((o) =>
    gridPosition.type === 'option'
      ? o.id === gridPosition.optionId
      : o.type === 'candidate' && o.writeInIndex === gridPosition.writeInIndex
  );
  assert(
    option,
    `option not found for mark ${gridPosition.contestId}/${
      gridPosition.type === 'option'
        ? gridPosition.optionId
        : `write-in-${gridPosition.writeInIndex}`
    }`
  );

  return option;
}

/**
 * Finds the scored write-in area for the given grid position. Asserts that the
 * grid position represents a write-in, should be used only if the area is expected to exist.
 */
function findScoredWriteInAreaForGridPosition(
  scoredWriteInAreas: ScoredPositionArea[],
  gridPosition: GridPosition
): ScoredPositionArea {
  assert(gridPosition.type === 'write-in');
  return find(
    scoredWriteInAreas,
    (w) =>
      w.gridPosition.type === 'write-in' &&
      w.gridPosition.contestId === gridPosition.contestId &&
      w.gridPosition.writeInIndex === gridPosition.writeInIndex
  );
}

function shouldScoreWriteIns(options: InterpreterOptions): boolean {
  return options.adjudicationReasons.includes(
    AdjudicationReason.UnmarkedWriteIn
  );
}

// TODO: Replace usage of this with write-in thresholds specific to each write-in
const TEMPORARY_DEFAULT_WRITE_IN_AREA_THRESHOLD = 0.05;

/**
 * Determining marks, adjudication status, and and unmarked write-ins share similar
 * checks and thresholds, so we aggregate information here as a conversion intermediary.
 */
function aggregateContestOptionScores({
  marks,
  writeIns,
  contests,
  options,
}: {
  marks: ScoredBubbleMarks;
  writeIns: ScoredPositionArea[];
  contests: Contests;
  options: InterpreterOptions;
}): ScoredContestOption[] {
  return marks.map(([gridPosition, scoredMark]) => {
    const option = getContestOptionForGridPosition(contests, gridPosition);

    assert(scoredMark, 'scoredMark must be defined');
    const markStatus =
      scoredMark.fillScore >= options.markThresholds.definite
        ? MarkStatus.Marked
        : scoredMark.fillScore >= options.markThresholds.marginal
        ? MarkStatus.Marginal
        : MarkStatus.Unmarked;

    const expectScoredWriteInArea =
      shouldScoreWriteIns(options) && gridPosition.type === 'write-in';
    const scoredWriteInArea = expectScoredWriteInArea
      ? findScoredWriteInAreaForGridPosition(writeIns, gridPosition)
      : undefined;
    const writeInTextAreaThreshold =
      options.markThresholds.writeInTextArea ??
      /* istanbul ignore next */
      TEMPORARY_DEFAULT_WRITE_IN_AREA_THRESHOLD;
    const writeInAreaStatus = scoredWriteInArea
      ? scoredWriteInArea.score >= writeInTextAreaThreshold
        ? WriteInAreaStatus.Filled
        : WriteInAreaStatus.Unfilled
      : WriteInAreaStatus.Ignored;

    return {
      option,
      gridPosition,
      scoredMark,
      markStatus,
      scoredWriteInArea,
      writeInAreaStatus,
    };
  });
}

function convertScoredContestOptionToLegacyMark({
  option,
  scoredMark,
}: ScoredContestOption): BallotTargetMark {
  const bounds: Rect = {
    x: scoredMark.matchedBounds.left,
    y: scoredMark.matchedBounds.top,
    width: scoredMark.matchedBounds.width,
    height: scoredMark.matchedBounds.height,
  };

  if (option.type === 'candidate' || option.type === 'yesno') {
    const ballotTargetMarkBase: Omit<BallotTargetMark, 'type' | 'optionId'> = {
      contestId: option.contestId,
      score: scoredMark.fillScore,
      bounds,
      scoredOffset: {
        x: scoredMark.matchedBounds.left - scoredMark.expectedBounds.left,
        y: scoredMark.matchedBounds.top - scoredMark.expectedBounds.top,
      },
      target: {
        inner: bounds,
        bounds,
      },
    };

    return { type: option.type, optionId: option.id, ...ballotTargetMarkBase };
  }

  /* istanbul ignore next */
  throwIllegalValue(option);
}

function convertScoredContestOptionsToMarkInfo(
  geometry: Geometry,
  scoredContestOptions: ScoredContestOption[]
): MarkInfo {
  const markInfo: MarkInfo = {
    ballotSize: geometry.canvasSize,
    marks: scoredContestOptions.map((scoredContestOption) =>
      convertScoredContestOptionToLegacyMark(scoredContestOption)
    ),
  };

  return markInfo;
}

function getUnmarkedWriteInsFromScoredContestOptions(
  scoredContestOptions: ScoredContestOption[]
): InterpretedHmpbPage['unmarkedWriteIns'] {
  return scoredContestOptions
    .filter(
      ({ markStatus, writeInAreaStatus }) =>
        markStatus !== MarkStatus.Marked &&
        writeInAreaStatus === WriteInAreaStatus.Filled
    )
    .map(({ option, scoredWriteInArea }) => {
      assert(scoredWriteInArea);
      return {
        contestId: option.contestId,
        optionId: option.id as WriteInId,
      };
    });
}

/**
 * Derives adjudication information from the given marks.
 */
export function determineAdjudicationInfoFromScoredContestOptions(
  electionDefinition: ElectionDefinition,
  options: InterpreterOptions,
  contestOptionScores: ScoredContestOption[]
): AdjudicationInfo {
  const enabledReasons = options.adjudicationReasons;

  const contests = electionDefinition.election.contests.filter((c) =>
    contestOptionScores.some(
      ({ gridPosition: { contestId } }) => contestId === c.id
    )
  );
  const adjudicationReasonInfos = getAllPossibleAdjudicationReasons(
    contests,
    contestOptionScores
  );

  const [enabledReasonInfos, ignoredReasonInfos] = iter(
    adjudicationReasonInfos
  ).partition((reasonInfo) => enabledReasons.includes(reasonInfo.type));

  return {
    requiresAdjudication: enabledReasonInfos.length > 0,
    enabledReasonInfos: [...enabledReasonInfos],
    enabledReasons,
    ignoredReasonInfos: [...ignoredReasonInfos],
  };
}

function buildInterpretedHmpbPageMetadata(
  electionDefinition: ElectionDefinition,
  options: InterpreterOptions,
  frontMetadata: BallotPageTimingMarkMetadataFront,
  side: 'front' | 'back'
): HmpbBallotPageMetadata {
  const { election } = electionDefinition;
  const ballotStyle = getBallotStyle({
    election,
    ballotStyleId: `card-number-${frontMetadata.cardNumber}`,
  });
  assert(ballotStyle, `Ballot style ${frontMetadata.cardNumber} not found`);
  const precinctId = ballotStyle.precincts[0];
  assert(
    precinctId !== undefined,
    `Precinct ${frontMetadata.batchOrPrecinctNumber} not found`
  );

  return {
    ballotStyleId: ballotStyle.id,
    precinctId,
    ballotType: BallotType.Precinct,
    electionHash: electionDefinition.electionHash,
    isTestMode: options.testMode,
    pageNumber: side === 'front' ? 1 : 2,
  };
}

function convertContestLayouts(
  contests: Contests,
  contestLayouts: InterpretedContestLayout[]
): BallotPageContestLayout[] {
  function convertRect(rect: NextRect): Rect {
    return {
      x: rect.left,
      y: rect.top,
      width: rect.width,
      height: rect.height,
    };
  }

  function rectToCorners(rect: NextRect): Corners {
    return [
      // Top left
      { x: rect.left, y: rect.top },
      // Top right
      { x: rect.left + rect.width, y: rect.top },
      // Bottom left
      { x: rect.left, y: rect.top + rect.height },
      // Bottom right
      { x: rect.left + rect.width, y: rect.top + rect.height },
    ];
  }

  function convertContestOptionLayout(
    contest: AnyContest,
    { bounds, optionId }: InterpretedContestOptionLayout
  ): BallotPageContestOptionLayout {
    const option = iter(allContestOptions(contest)).find(
      (o) => o.id === optionId
    );
    assert(option, `option ${optionId} not found`);
    return {
      definition: option,
      bounds: convertRect(bounds),
      // TODO is this needed? Filled with a dummy value for now
      target: {
        bounds: { x: 0, y: 0, width: 1, height: 1 },
        inner: { x: 0, y: 0, width: 1, height: 1 },
      },
    };
  }

  return contestLayouts.map(({ contestId, bounds, options }) => {
    const contest = find(contests, (c) => c.id === contestId);
    return {
      contestId,
      bounds: convertRect(bounds),
      corners: rectToCorners(bounds),
      options: options.map((option) =>
        convertContestOptionLayout(contest, option)
      ),
    };
  });
}

function convertInterpretedBallotPage(
  electionDefinition: ElectionDefinition,
  options: InterpreterOptions,
  interpretedBallotCard: InterpretedBallotCard,
  side: 'front' | 'back'
): InterpretFileResult {
  const sideMetadata = interpretedBallotCard[side].metadata;
  const metadata =
    sideMetadata.source === 'qr-code'
      ? sideMetadata
      : buildInterpretedHmpbPageMetadata(
          electionDefinition,
          options,
          // For timing mark metadata, always use the front, since it contains
          // the info we need
          interpretedBallotCard.front
            .metadata as BallotPageTimingMarkMetadataFront,
          side
        );

  const interpretation = interpretedBallotCard[side];
  const contestOptionScores: ScoredContestOption[] =
    aggregateContestOptionScores({
      marks: interpretation.marks,
      writeIns: interpretation.writeIns,
      contests: electionDefinition.election.contests,
      options,
    });
  const markInfo = convertScoredContestOptionsToMarkInfo(
    interpretation.grid.geometry,
    contestOptionScores
  );
  return {
    interpretation: {
      type: 'InterpretedHmpbPage',
      metadata,
      markInfo,
      adjudicationInfo: determineAdjudicationInfoFromScoredContestOptions(
        electionDefinition,
        options,
        contestOptionScores
      ),
      votes: convertMarksToVotesDict(
        electionDefinition.election.contests,
        options.markThresholds,
        markInfo.marks
      ),
      unmarkedWriteIns: shouldScoreWriteIns(options)
        ? getUnmarkedWriteInsFromScoredContestOptions(contestOptionScores)
        : undefined,
      layout: {
        pageSize: interpretation.grid.geometry.canvasSize,
        metadata,
        contests: convertContestLayouts(
          electionDefinition.election.contests,
          interpretation.contestLayouts
        ),
      },
    },
    normalizedImage: interpretation.normalizedImage,
  };
}

/**
 * Converts the result of the Rust interpreter to the result format used by the
 * rest of VxSuite.
 */
export async function convertRustInterpretResult(
  options: InterpreterOptions,
  nextResult: NextInterpretResult,
  sheet: SheetOf<string>
): Promise<InterpretResult> {
  /* istanbul ignore next */
  if (nextResult.isErr()) {
    return ok(
      await mapSheet(sheet, async (page) => ({
        interpretation: {
          type: 'UnreadablePage',
          reason: nextResult.err().type,
        },
        normalizedImage: await loadImageData(page),
      }))
    );
  }

  const ballotCard = nextResult.ok();
  const currentResult: OkType<InterpretResult> = [
    convertInterpretedBallotPage(
      options.electionDefinition,
      options,
      ballotCard,
      'front'
    ),
    convertInterpretedBallotPage(
      options.electionDefinition,
      options,
      ballotCard,
      'back'
    ),
  ];
  return ok(currentResult);
}

/**
 * Validates the interpreter results against the scanning configuration.
 *
 * @returns The same results, but with any invalid results replaced with an
 *          error result.
 */
function validateInterpretResults(
  results: SheetOf<InterpretFileResult>,
  {
    electionHash,
    precinctSelection,
    testMode,
  }: {
    electionHash: string;
    precinctSelection: PrecinctSelection;
    testMode: boolean;
  }
): SheetOf<InterpretFileResult> {
  return mapSheet(results, ({ interpretation, normalizedImage }) => {
    if (!('metadata' in interpretation)) {
      return { interpretation, normalizedImage };
    }

    const metadata = interpretation.metadata as BallotMetadata;

    if (metadata.isTestMode !== testMode) {
      return {
        interpretation: typedAs<InvalidTestModePage>({
          type: 'InvalidTestModePage',
          metadata,
        }),
        normalizedImage,
      };
    }

    if (
      precinctSelection.kind !== ALL_PRECINCTS_SELECTION.kind &&
      metadata.precinctId !== precinctSelection.precinctId
    ) {
      return {
        interpretation: typedAs<InvalidPrecinctPage>({
          type: 'InvalidPrecinctPage',
          metadata,
        }),
        normalizedImage,
      };
    }

    // metadata.electionHash may be a sliced hash or a full hash, so we need to
    // slice both hashes before comparing them.
    if (
      sliceElectionHash(metadata.electionHash) !==
      sliceElectionHash(electionHash)
    ) {
      return {
        interpretation: typedAs<InvalidElectionHashPage>({
          type: 'InvalidElectionHashPage',
          expectedElectionHash: sliceElectionHash(electionHash),
          actualElectionHash: sliceElectionHash(metadata.electionHash),
        }),
        normalizedImage,
      };
    }

    return { interpretation, normalizedImage };
  });
}

/**
 * Interpret a HMPB sheet and convert the result from the Rust
 * interpreter's result format to the result format used by the rest of VxSuite.
 */
async function interpretHmpb(
  sheet: SheetOf<string>,
  options: InterpreterOptions
): Promise<SheetOf<InterpretFileResult>> {
  const { electionDefinition, precinctSelection, testMode } = options;
  const result = interpretHmpbBallotSheetRust(electionDefinition, sheet, {
    scoreWriteIns: shouldScoreWriteIns(options),
  });

  return validateInterpretResults(
    (await convertRustInterpretResult(options, result, sheet)).unsafeUnwrap(),
    {
      electionHash: electionDefinition.electionHash,
      precinctSelection,
      testMode,
    }
  );
}

/**
 * Interpret a BMD ballot sheet and convert the result into the result format
 * used by the rest of VxSuite.
 */
async function interpretBmdBallot(
  sheet: SheetOf<string>,
  options: InterpreterOptions
): Promise<SheetOf<InterpretFileResult>> {
  const { electionDefinition, precinctSelection, testMode } = options;
  const ballotImages = await mapSheet(sheet, (ballotImagePath) =>
    loadImageData(ballotImagePath)
  );
  const interpretResult = await interpretVxBmdBallotSheet(
    electionDefinition,
    ballotImages
  );

  if (interpretResult.isErr()) {
    const error = interpretResult.err();
    if (error.type === 'mismatched-election') {
      return [
        {
          interpretation: {
            type: 'InvalidElectionHashPage',
            expectedElectionHash: error.expectedElectionHash,
            actualElectionHash: error.actualElectionHash,
          },
          normalizedImage: ballotImages[0],
        },
        {
          interpretation: {
            type: 'InvalidElectionHashPage',
            expectedElectionHash: error.expectedElectionHash,
            actualElectionHash: error.actualElectionHash,
          },
          normalizedImage: ballotImages[1],
        },
      ];
    }

    const [frontReason, backReason] = error.source;
    switch (error.type) {
      case 'votes-not-found':
        return [
          {
            interpretation: {
              type: 'BlankPage',
            },
            normalizedImage: ballotImages[0],
          },
          {
            interpretation: {
              type: 'BlankPage',
            },
            normalizedImage: ballotImages[1],
          },
        ];

      case 'multiple-qr-codes':
        return [
          {
            interpretation: {
              type: 'UnreadablePage',
              reason: JSON.stringify(frontReason),
            },
            normalizedImage: ballotImages[0],
          },
          {
            interpretation: {
              type: 'UnreadablePage',
              reason: JSON.stringify(backReason),
            },
            normalizedImage: ballotImages[1],
          },
        ];

      /* istanbul ignore next - compile-time check */
      default:
        throwIllegalValue(error, 'type');
    }
  }

  const { ballot, summaryBallotImage, blankPageImage } = interpretResult.ok();

  const front: InterpretFileResult = {
    interpretation: {
      type: 'InterpretedBmdPage',
      ballotId: ballot.ballotId,
      metadata: {
        electionHash: ballot.electionHash,
        ballotType: BallotType.Precinct,
        ballotStyleId: ballot.ballotStyleId,
        precinctId: ballot.precinctId,
        isTestMode: ballot.isTestMode,
      },
      votes: ballot.votes,
    },
    normalizedImage: summaryBallotImage,
  };
  const back: InterpretFileResult = {
    interpretation: {
      type: 'BlankPage',
    },
    normalizedImage: blankPageImage,
  };

  return validateInterpretResults([front, back], {
    electionHash: electionDefinition.electionHash,
    precinctSelection,
    testMode,
  });
}

/**
 * Interpret a sheet of ballot images.
 */
export async function interpretSheet(
  options: InterpreterOptions,
  sheet: SheetOf<string>
): Promise<SheetOf<InterpretFileResult>> {
  const timer = time(debug, `interpretSheet: ${sheet.join(', ')}`);

  try {
    if (options.electionDefinition.election.gridLayouts) {
      return await interpretHmpb(sheet, options);
    }
    return await interpretBmdBallot(sheet, options);
  } finally {
    timer.end();
  }
}

/**
 * Interpret a ballot sheet and save the images to their final storage location.
 */
export async function interpretSheetAndSaveImages(
  interpreterOptions: InterpreterOptions,
  sheet: SheetOf<string>,
  sheetId: Id,
  ballotImagesPath: string
): Promise<SheetOf<PageInterpretationWithFiles>> {
  return mapSheet(
    await interpretSheet(interpreterOptions, sheet),
    async (result, side) => {
      const ballotImagePath = sheet[side === 'front' ? 0 : 1];
      const imagePath = await saveSheetImage({
        sheetId,
        side,
        ballotImagesPath,
        sourceImagePath: ballotImagePath,
        normalizedImage: result.normalizedImage,
      });
      return {
        interpretation: result.interpretation,
        imagePath,
      };
    }
  );
}
