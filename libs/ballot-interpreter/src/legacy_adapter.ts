import {
  assert,
  err,
  find,
  iter,
  ok,
  Ok,
  throwIllegalValue,
} from '@votingworks/basics';
import {
  AdjudicationInfo,
  AnyContest,
  BallotMark,
  BallotPageContestLayout,
  BallotPageContestOptionLayout,
  BallotTargetMark,
  BallotType,
  Contests,
  Corners,
  ElectionDefinition,
  getBallotStyle,
  GridPosition,
  HmpbBallotPageMetadata,
  MarkInfo,
  MarkStatus,
  MarkThresholds,
  Rect,
} from '@votingworks/types';
import {
  allContestOptions,
  ballotAdjudicationReasons,
  convertMarksToVotesDict,
} from '@votingworks/utils';
import {
  BallotPageTimingMarkMetadataFront,
  Geometry,
  InterpretedBallotCard,
  HmpbInterpretResult as NextInterpretResult,
  Rect as NextRect,
  InterpretedContestLayout,
  InterpretedContestOptionLayout,
  ScoredBubbleMarks,
  ScoredPositionArea,
} from './hmpb-ts';
import type {
  InterpretFileResult,
  InterpretResult,
  InterpreterOptions,
} from './interpret';

type OkType<T> = T extends Ok<infer U> ? U : never;

function convertNewHampshireNextMarkToSharedMark(
  contests: Contests,
  markThresholds: MarkThresholds,
  [gridPosition, scoredMark]: ScoredBubbleMarks[number],
  scoredWriteInArea?: ScoredPositionArea
): BallotTargetMark {
  assert(scoredMark, 'scoredMark must be defined');

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

  const bounds: Rect = {
    x: scoredMark.matchedBounds.left,
    y: scoredMark.matchedBounds.top,
    width: scoredMark.matchedBounds.width,
    height: scoredMark.matchedBounds.height,
  };

  if (option.type === 'candidate' || option.type === 'yesno') {
    const score =
      // use the mark fill score if the bubble is filled in enough
      scoredMark.fillScore >= markThresholds.definite
        ? scoredMark.fillScore
        : // or, if there's enough text in the write-in area, score that at 100%
        scoredWriteInArea &&
          typeof markThresholds.writeInTextArea === 'number' &&
          scoredWriteInArea.score >= markThresholds.writeInTextArea
        ? 1
        : // otherwise, just leave the mark fill score alone
          scoredMark.fillScore;
    const ballotTargetMarkBase: Omit<BallotTargetMark, 'type' | 'optionId'> = {
      contestId: option.contestId,
      score,
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

/**
 * Derives adjudication information from the given marks.
 */
export function convertMarksToAdjudicationInfo(
  electionDefinition: ElectionDefinition,
  options: InterpreterOptions,
  marks: BallotMark[]
): AdjudicationInfo {
  const enabledReasons = options.adjudicationReasons ?? [];

  const contests = electionDefinition.election.contests.filter((c) =>
    marks.some(({ contestId }) => contestId === c.id)
  );
  const adjudicationReasonInfos = Array.from(
    ballotAdjudicationReasons(contests, {
      optionMarkStatus: (option) => {
        const contestMarks = marks.filter((mark) => {
          if (mark.contestId !== option.contestId) {
            return false;
          }

          return mark.optionId === option.id;
        });
        assert(
          contestMarks.length > 0,
          `mark for option ${option.id} not found`
        );

        let fallbackStatus = MarkStatus.Unmarked;

        for (const mark of contestMarks) {
          if (mark.score >= options.markThresholds.definite) {
            return MarkStatus.Marked;
          }

          if (mark.score >= options.markThresholds.marginal) {
            fallbackStatus = MarkStatus.Marginal;
          }
        }

        return fallbackStatus;
      },
    })
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

function findScoredWriteInAreaForGridPosition(
  scoredWriteInAreas: ScoredPositionArea[],
  gridPosition: GridPosition
): ScoredPositionArea | undefined {
  return gridPosition.type === 'write-in'
    ? scoredWriteInAreas.find(
        (w) =>
          w.gridPosition.type === 'write-in' &&
          w.gridPosition.contestId === gridPosition.contestId &&
          w.gridPosition.writeInIndex === gridPosition.writeInIndex
      )
    : undefined;
}

function convertMarksToMarkInfo(
  contests: Contests,
  markThresholds: MarkThresholds,
  geometry: Geometry,
  marks: ScoredBubbleMarks,
  writeIns: ScoredPositionArea[]
): MarkInfo {
  const markInfo: MarkInfo = {
    ballotSize: geometry.canvasSize,
    marks: marks.map((mark) =>
      convertNewHampshireNextMarkToSharedMark(
        contests,
        markThresholds,
        mark,
        findScoredWriteInAreaForGridPosition(writeIns, mark[0])
      )
    ),
  };

  return markInfo;
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
    ballotType: BallotType.Standard,
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
  const markInfo = convertMarksToMarkInfo(
    electionDefinition.election.contests,
    options.markThresholds,
    interpretation.grid.geometry,
    interpretation.marks,
    interpretation.writeIns
  );
  return {
    interpretation: {
      type: 'InterpretedHmpbPage',
      metadata,
      markInfo,
      adjudicationInfo: convertMarksToAdjudicationInfo(
        electionDefinition,
        options,
        markInfo.marks
      ),
      votes: convertMarksToVotesDict(
        electionDefinition.election.contests,
        options.markThresholds,
        markInfo.marks
      ),
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
export function convertNhInterpretResultToLegacyResult(
  options: InterpreterOptions,
  nextResult: NextInterpretResult
): InterpretResult {
  /* istanbul ignore next */
  if (nextResult.isErr()) {
    return err(new Error(JSON.stringify(nextResult.err())));
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
