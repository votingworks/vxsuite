import * as current from '@votingworks/ballot-interpreter-nh';
import * as next from '@votingworks/ballot-interpreter-nh-next';
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
  BallotTargetMark,
  BallotType,
  Contests,
  ElectionDefinition,
  getBallotStyle,
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

type OkType<T> = T extends Ok<infer U> ? U : never;

type CurrentInterpretResult = Awaited<ReturnType<typeof current.interpret>>;
type CurrentInterpretOptions = Parameters<typeof current.interpret>[2];

function convertNewHampshireNextMarkToSharedMark(
  contests: Contests,
  [gridPosition, scoredMark]: next.ScoredOvalMarks[number]
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
    }: all options=${JSON.stringify(
      Array.from(allContestOptions(contest)),
      null,
      2
    )}`
  );

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

    // `{ type: option.type, … }` would be better but TS doesn't like that.
    return option.type === 'candidate'
      ? { type: 'candidate', optionId: option.id, ...ballotTargetMarkBase }
      : { type: 'yesno', optionId: option.id, ...ballotTargetMarkBase };
  }

  throwIllegalValue(option);
}

function convertMarksToAdjudicationInfo(
  electionDefinition: ElectionDefinition,
  options: CurrentInterpretOptions,
  marks: next.ScoredOvalMarks
): AdjudicationInfo {
  const markThresholds =
    options.markThresholds ?? electionDefinition.election.markThresholds;
  const enabledReasons =
    options.adjudicationReasons ??
    electionDefinition.election.precinctScanAdjudicationReasons ??
    [];
  assert(markThresholds, 'markThresholds must be defined');

  const contests = electionDefinition.election.contests.filter((c) =>
    marks.some(([{ contestId }]) => contestId === c.id)
  );
  const adjudicationReasonInfos = Array.from(
    ballotAdjudicationReasons(contests, {
      optionMarkStatus: (option) => {
        const contestMarks = marks.filter(([gridPosition]) => {
          if (gridPosition.contestId !== option.contestId) {
            return false;
          }

          if (gridPosition.type === 'option') {
            return gridPosition.optionId === option.id;
          }

          if (gridPosition.type === 'write-in') {
            assert(option.type === 'candidate');
            return gridPosition.writeInIndex === option.writeInIndex;
          }

          return false;
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
    requiresAdjudication: enabledReasonInfos.size > 0,
    enabledReasonInfos: [...enabledReasonInfos],
    enabledReasons,
    ignoredReasonInfos: [...ignoredReasonInfos],
  };
}

function convertMarksToMarkInfo(
  contests: Contests,
  geometry: next.Geometry,
  marks: next.ScoredOvalMarks
): MarkInfo {
  const markInfo: MarkInfo = {
    ballotSize: geometry.canvasSize,
    marks: marks.map((mark) =>
      convertNewHampshireNextMarkToSharedMark(contests, mark)
    ),
  };

  return markInfo;
}

function convertMarksToVotes(
  contests: Contests,
  markThresholds: MarkThresholds,
  marks: next.ScoredOvalMarks
): VotesDict {
  return convertMarksToVotesDict(
    contests,
    markThresholds,
    iter(marks).map((scoredOvalMark) =>
      convertNewHampshireNextMarkToSharedMark(contests, scoredOvalMark)
    )
  );
}

function buildInterpretedHmpbPageMetadata(
  electionDefinition: ElectionDefinition,
  options: CurrentInterpretOptions,
  frontMetadata: next.BallotPageMetadataFront
): HmpbBallotPageMetadata {
  const ballotStyleId = `card-number-${frontMetadata.cardNumber}`;
  const ballotStyle = getBallotStyle({
    election: electionDefinition.election,
    ballotStyleId,
  });
  assert(ballotStyle, `ballot style ${ballotStyleId} not found`);

  return {
    ballotStyleId,
    precinctId: ballotStyle.precincts[0],
    ballotType: BallotType.Standard,
    electionHash: electionDefinition.electionHash,
    isTestMode: options.isTestMode,
    locales: { primary: 'en-US' },
    pageNumber: 1,
  };
}

function convertNextInterpretedBallotPage(
  electionDefinition: ElectionDefinition,
  options: CurrentInterpretOptions,
  nextInterpretedBallotCard: next.InterpretedBallotCard,
  nextInterpretation: next.InterpretedBallotPage
): current.InterpretFileResult {
  const markThresholds =
    options.markThresholds ?? electionDefinition.election.markThresholds;
  assert(markThresholds, 'markThresholds must be defined');

  return {
    interpretation: {
      type: 'InterpretedHmpbPage',
      metadata: buildInterpretedHmpbPageMetadata(
        electionDefinition,
        options,
        nextInterpretedBallotCard.front.grid
          .metadata as next.BallotPageMetadataFront
      ),
      markInfo: convertMarksToMarkInfo(
        electionDefinition.election.contests,
        nextInterpretation.grid.geometry,
        nextInterpretation.marks
      ),
      adjudicationInfo: convertMarksToAdjudicationInfo(
        electionDefinition,
        options,
        nextInterpretation.marks
      ),
      votes: convertMarksToVotes(
        electionDefinition.election.contests,
        markThresholds,
        nextInterpretation.marks
      ),
    },
  };
}

function convertNextInterpretResult(
  electionDefinition: ElectionDefinition,
  options: CurrentInterpretOptions,
  nextResult: next.InterpretResult
): CurrentInterpretResult {
  if (nextResult.isErr()) {
    return err(new Error(JSON.stringify(nextResult.err())));
  }

  const ballotCard = nextResult.ok();
  const { front, back } = ballotCard;
  const currentResult: OkType<CurrentInterpretResult> = [
    convertNextInterpretedBallotPage(
      electionDefinition,
      options,
      ballotCard,
      front
    ),
    convertNextInterpretedBallotPage(
      electionDefinition,
      options,
      ballotCard,
      back
    ),
  ];
  return ok(currentResult);
}

/**
 * Interprets a scanned ballot using `@votingworks/ballot-interpreter-nh-next`.
 */
export const interpret: typeof current.interpret = (
  electionDefinition,
  sheet,
  options
) => {
  const nextResult = next.interpret(electionDefinition, sheet);
  return Promise.resolve(
    convertNextInterpretResult(electionDefinition, options, nextResult)
  );
};
