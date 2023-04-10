import * as current from '@votingworks/ballot-interpreter-nh';
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
  AdjudicationReason,
  BallotTargetMark,
  BallotType,
  Contests,
  ElectionDefinition,
  getBallotStyle,
  HmpbBallotPageMetadata,
  MarkInfo,
  MarkStatus,
  MarkThresholds,
  PrecinctId,
  Rect,
  SheetOf,
  VotesDict,
} from '@votingworks/types';
import {
  allContestOptions,
  ballotAdjudicationReasons,
  convertMarksToVotesDict,
} from '@votingworks/utils';
import { interpret as interpretNext } from './interpret';
import {
  BallotPageMetadataFront,
  Geometry,
  InterpretedBallotCard,
  InterpretedBallotPage,
  InterpretResult as NextInterpretResult,
  ScoredOvalMarks,
} from './types';

type OkType<T> = T extends Ok<infer U> ? U : never;

type InterpretResult = Awaited<ReturnType<typeof current.interpret>>;
type InterpretOptions = Exclude<
  Parameters<typeof current.interpret>[2],
  'adjudicationReasons'
> & {
  adjudicationReasons: readonly AdjudicationReason[];
};

function convertNewHampshireNextMarkToSharedMark(
  contests: Contests,
  [gridPosition, scoredMark]: ScoredOvalMarks[number]
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

  /* istanbul ignore next */
  throwIllegalValue(option);
}

/**
 * Derives adjudication information from the given marks.
 */
export function convertMarksToAdjudicationInfo(
  electionDefinition: ElectionDefinition,
  options: InterpretOptions,
  marks: ScoredOvalMarks
): AdjudicationInfo {
  const markThresholds =
    options.markThresholds ?? electionDefinition.election.markThresholds;
  const enabledReasons = options.adjudicationReasons;
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
    requiresAdjudication: enabledReasonInfos.size > 0,
    enabledReasonInfos: [...enabledReasonInfos],
    enabledReasons,
    ignoredReasonInfos: [...ignoredReasonInfos],
  };
}

function convertMarksToMarkInfo(
  contests: Contests,
  geometry: Geometry,
  marks: ScoredOvalMarks
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
  marks: ScoredOvalMarks
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
  options: InterpretOptions,
  frontMetadata: BallotPageMetadataFront
): HmpbBallotPageMetadata {
  const ballotStyleId = `card-number-${frontMetadata.cardNumber}`;
  const ballotStyle = getBallotStyle({
    election: electionDefinition.election,
    ballotStyleId,
  });
  assert(ballotStyle, `ballot style ${ballotStyleId} not found`);
  assert(ballotStyle.precincts.length === 1, 'expected exactly one precinct');

  return {
    ballotStyleId,
    precinctId: ballotStyle.precincts[0] as PrecinctId,
    ballotType: BallotType.Standard,
    electionHash: electionDefinition.electionHash,
    isTestMode: options.isTestMode,
    locales: { primary: 'en-US' },
    pageNumber: 1,
  };
}

function convertNextInterpretedBallotPage(
  electionDefinition: ElectionDefinition,
  options: InterpretOptions,
  nextInterpretedBallotCard: InterpretedBallotCard,
  nextInterpretation: InterpretedBallotPage
): current.InterpretFileResult {
  /* istanbul ignore next */
  const markThresholds =
    options.markThresholds ?? electionDefinition.election.markThresholds;
  assert(markThresholds, 'markThresholds must be defined');

  return {
    interpretation: {
      type: 'InterpretedHmpbPage',
      metadata: buildInterpretedHmpbPageMetadata(
        electionDefinition,
        options,
        nextInterpretedBallotCard.front.grid.metadata as BallotPageMetadataFront
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
  options: InterpretOptions,
  nextResult: NextInterpretResult
): InterpretResult {
  /* istanbul ignore next */
  if (nextResult.isErr()) {
    return err(new Error(JSON.stringify(nextResult.err())));
  }

  const ballotCard = nextResult.ok();
  const { front, back } = ballotCard;
  const currentResult: OkType<InterpretResult> = [
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
 * Interprets a scanned ballot and returns a result that's compatible with
 * `@votingworks/ballot-interpreter-nh`.
 */
export function interpret(
  electionDefinition: ElectionDefinition,
  sheet: SheetOf<string>,
  options: InterpretOptions
): Promise<InterpretResult> {
  const nextResult = interpretNext(electionDefinition, sheet);
  return Promise.resolve(
    convertNextInterpretResult(electionDefinition, options, nextResult)
  );
}
