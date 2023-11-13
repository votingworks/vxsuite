import {
  assert,
  find,
  iter,
  ok,
  Ok,
  throwIllegalValue,
} from '@votingworks/basics';
import {
  AdjudicationInfo,
  AnyContest,
  BallotPageContestLayout,
  BallotPageContestOptionLayout,
  BallotTargetMark,
  BallotType,
  ContestOption,
  Contests,
  Corners,
  ElectionDefinition,
  getBallotStyle,
  GridPosition,
  HmpbBallotPageMetadata,
  InterpretedHmpbPage,
  mapSheet,
  MarkInfo,
  MarkStatus,
  Rect,
  SheetOf,
  WriteInAreaStatus,
  WriteInId,
} from '@votingworks/types';
import { allContestOptions, convertMarksToVotesDict } from '@votingworks/utils';
import { loadImageData } from '@votingworks/image-utils';
import {
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
import { type InterpretFileResult, type InterpretResult } from './interpret';
import { shouldScoreWriteIns, InterpreterOptions } from './options';
import { getAllPossibleAdjudicationReasons } from './adjudication_reasons';

/**
 * Conversion intermediary for marks containing the grid position, associated
 * contest option, the mark score, and the write-in area score if applicable.
 */
export interface ScoredContestOption {
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

function convertNextInterpretedBallotPage(
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
    normalizedImage: {
      ...interpretation.normalizedImage,
      data: new Uint8ClampedArray(interpretation.normalizedImage.data),
    },
  };
}

/**
 * Converts the result of the NH interpreter to the legacy interpreter result format.
 */
export async function convertNhInterpretResultToLegacyResult(
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
    convertNextInterpretedBallotPage(
      options.electionDefinition,
      options,
      ballotCard,
      'front'
    ),
    convertNextInterpretedBallotPage(
      options.electionDefinition,
      options,
      ballotCard,
      'back'
    ),
  ];
  return ok(currentResult);
}
