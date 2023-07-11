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
  VotesDict,
} from '@votingworks/types';
import {
  allContestOptions,
  ballotAdjudicationReasons,
  convertMarksToVotesDict,
} from '@votingworks/utils';
import {
  BallotPageMetadataFront,
  Geometry,
  InterpretedBallotCard,
  InterpretResult as NextInterpretResult,
  Rect as NextRect,
  InterpretedContestLayout,
  InterpretedContestOptionLayout,
  ScoredBubbleMarks,
  ScoredPositionArea,
} from '@votingworks/ballot-interpreter-nh';
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

    // `{ type: option.type, … }` would be better but TS doesn't like that.
    return option.type === 'candidate'
      ? { type: 'candidate', optionId: option.id, ...ballotTargetMarkBase }
      : { type: 'yesno', optionId: option.id, ...ballotTargetMarkBase };
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
  marks: ScoredBubbleMarks
): AdjudicationInfo {
  const markThresholds =
    options.markThresholds ?? electionDefinition.election.markThresholds;
  const enabledReasons = options.adjudicationReasons ?? [];
  assert(markThresholds, 'markThresholds must be defined');

  const contests = electionDefinition.election.contests.filter((c) =>
    marks.some(([{ contestId }]) => contestId === c.id)
  );
  const adjudicationReasonInfos = Array.from(
    ballotAdjudicationReasons(contests, {
      optionMarkStatus: (option) => {
        // eslint-disable-next-line array-callback-return -- `default` throws
        const contestMarks = marks.filter(([gridPosition]) => {
          if (gridPosition.contestId !== option.contestId) {
            return false;
          }

          switch (gridPosition.type) {
            case 'option':
              return gridPosition.optionId === option.id;

            case 'write-in':
              assert(option.type === 'candidate');
              return gridPosition.writeInIndex === option.writeInIndex;

            /* istanbul ignore next */
            default:
              throwIllegalValue(gridPosition);
          }
        });
        assert(
          contestMarks.length > 0,
          `mark for option ${option.id} not found`
        );

        let fallbackStatus = MarkStatus.Unmarked;

        for (const [, mark] of contestMarks) {
          if (mark && mark.fillScore >= markThresholds.definite) {
            return MarkStatus.Marked;
          }

          if (mark && mark.fillScore >= markThresholds.marginal) {
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

function convertMarksToVotes(
  contests: Contests,
  markThresholds: MarkThresholds,
  marks: ScoredBubbleMarks,
  writeIns: ScoredPositionArea[]
): VotesDict {
  return convertMarksToVotesDict(
    contests,
    markThresholds,
    iter(marks).map((scoredOvalMark) =>
      convertNewHampshireNextMarkToSharedMark(
        contests,
        markThresholds,
        scoredOvalMark,
        findScoredWriteInAreaForGridPosition(writeIns, scoredOvalMark[0])
      )
    )
  );
}

function buildInterpretedHmpbPageMetadata(
  electionDefinition: ElectionDefinition,
  options: InterpreterOptions,
  frontMetadata: BallotPageMetadataFront,
  side: 'front' | 'back'
): HmpbBallotPageMetadata {
  const { election } = electionDefinition;
  const isUsingCardNumberBallotStyles = election.ballotStyles.every(({ id }) =>
    id.startsWith('card-number-')
  );
  const ballotStyle =
    // If the election is using "card-number-{n}" ballot style IDs, use
    // the card number in the metadata to create that ballot style ID.
    isUsingCardNumberBallotStyles
      ? getBallotStyle({
          election,
          ballotStyleId: `card-number-${frontMetadata.cardNumber}`,
        })
      : // If not, use the card number in the metadata as an index into the
        // list of ballot styles.
        election.ballotStyles[frontMetadata.cardNumber];
  assert(ballotStyle, `Ballot style ${frontMetadata.cardNumber} not found`);
  const precinctId = isUsingCardNumberBallotStyles
    ? ballotStyle.precincts[0]
    : election.precincts[frontMetadata.batchOrPrecinctNumber]?.id;
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
  /* istanbul ignore next */
  const markThresholds =
    options.markThresholds ?? electionDefinition.election.markThresholds;
  assert(markThresholds, 'markThresholds must be defined');

  const metadata = buildInterpretedHmpbPageMetadata(
    electionDefinition,
    options,
    interpretedBallotCard.front.grid.metadata as BallotPageMetadataFront,
    side
  );

  const interpretation = interpretedBallotCard[side];
  return {
    interpretation: {
      type: 'InterpretedHmpbPage',
      metadata,
      markInfo: convertMarksToMarkInfo(
        electionDefinition.election.contests,
        markThresholds,
        interpretation.grid.geometry,
        interpretation.marks,
        interpretation.writeIns
      ),
      adjudicationInfo: convertMarksToAdjudicationInfo(
        electionDefinition,
        options,
        interpretation.marks
      ),
      votes: convertMarksToVotes(
        electionDefinition.election.contests,
        markThresholds,
        interpretation.marks,
        interpretation.writeIns
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
  electionDefinition: ElectionDefinition,
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
      electionDefinition,
      options,
      ballotCard,
      'front'
    ),
    convertNextInterpretedBallotPage(
      electionDefinition,
      options,
      ballotCard,
      'back'
    ),
  ];
  return ok(currentResult);
}
