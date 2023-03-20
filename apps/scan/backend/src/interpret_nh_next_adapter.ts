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
  BallotType,
  Candidate,
  ElectionDefinition,
  getBallotStyle,
  GridPosition,
  HmpbBallotPageMetadata,
  MarkInfo,
  MarkStatus,
  Rect,
  Vote,
  VotesDict,
} from '@votingworks/types';
import { ballotAdjudicationReasons } from '@votingworks/utils';

type Resolved<T> = T extends PromiseLike<infer U> ? U : T;
type OkType<T> = T extends Ok<infer U> ? U : never;

type CurrentInterpretResult = Resolved<ReturnType<typeof current.interpret>>;
type CurrentInterpretOptions = Parameters<typeof current.interpret>[2];

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
        const contest = find(contests, (c) => c.id === option.contestId);
        const contestMarks = marks.filter(([gridPosition]) => {
          if (gridPosition.contestId !== option.contestId) {
            return false;
          }

          if (gridPosition.type === 'option') {
            return gridPosition.optionId === option.id;
          }

          if (gridPosition.type === 'write-in') {
            const expectedWriteInIndex =
              option.optionIndex -
              (contest.type === 'candidate' ? contest.candidates.length : 0);
            return gridPosition.writeInIndex === expectedWriteInIndex;
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
  geometry: next.Geometry,
  marks: next.ScoredOvalMarks
): MarkInfo {
  return {
    ballotSize: geometry.canvasSize,
    marks: marks
      .filter((mark): mark is [GridPosition, next.ScoredOvalMark] => !!mark[1])
      .map(([gridPosition, scoredMark]) => {
        const matchedBounds: Rect = {
          x: scoredMark.matchedBounds.left,
          y: scoredMark.matchedBounds.top,
          width: scoredMark.matchedBounds.width,
          height: scoredMark.matchedBounds.height,
        };
        return {
          type: 'candidate',
          contestId: gridPosition.contestId,
          optionId:
            gridPosition.type === 'option'
              ? gridPosition.optionId
              : `write-in-${gridPosition.writeInIndex}`,
          score: scoredMark.fillScore,
          bounds: matchedBounds,
          scoredOffset: {
            x: scoredMark.matchedBounds.left - scoredMark.expectedBounds.left,
            y: scoredMark.matchedBounds.top - scoredMark.expectedBounds.top,
          },
          // FIXME: Use real data here.
          target: {
            bounds: matchedBounds,
            inner: matchedBounds,
          },
        };
      }),
  };
}

function convertMarksToVotes(
  electionDefinition: ElectionDefinition,
  options: CurrentInterpretOptions,
  marks: next.ScoredOvalMarks
): VotesDict {
  const { contests } = electionDefinition.election;
  const markThresholds =
    options.markThresholds ?? electionDefinition.election.markThresholds;
  assert(markThresholds, 'markThresholds must be defined');
  const votes: VotesDict = {};

  for (const [gridPosition, scoredMark] of marks) {
    if (!scoredMark) {
      continue;
    }

    const { contestId } = gridPosition;
    const contest = find(contests, (c) => c.id === contestId);

    let vote: Vote;

    if (contest.type === 'candidate') {
      const candidate: Candidate =
        gridPosition.type === 'option'
          ? find(contest.candidates, (c) => c.id === gridPosition.optionId)
          : {
              id: `write-in-${gridPosition.writeInIndex}`,
              name: `Write-In #${gridPosition.writeInIndex + 1}`,
              isWriteIn: true,
            };
      vote = [candidate];
    } else if (contest.type === 'yesno') {
      assert(gridPosition.type === 'option');
      vote = [gridPosition.optionId] as Vote;
    } else {
      throwIllegalValue(contest, 'type');
    }

    if (scoredMark.fillScore < markThresholds.marginal) {
      continue;
    }

    if (scoredMark.fillScore < markThresholds.definite) {
      continue;
    }

    if (!votes[contestId]) {
      votes[contestId] = vote;
    } else {
      const existing = votes[contestId] as Vote;
      votes[contestId] = [...existing, ...vote] as Vote;
    }
  }

  return votes;
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
        nextInterpretation.grid.geometry,
        nextInterpretation.marks
      ),
      adjudicationInfo: convertMarksToAdjudicationInfo(
        electionDefinition,
        options,
        nextInterpretation.marks
      ),
      votes: convertMarksToVotes(
        electionDefinition,
        options,
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
