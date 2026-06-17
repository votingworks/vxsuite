import {
  AdjudicationReason,
  AdjudicationReasonInfo,
  Contest,
  BallotStyle,
  ContestOption,
  MarkStatus,
  VotesDict,
  WriteInAreaStatus,
} from '@votingworks/types';
import { assertDefined, throwIllegalValue } from '@votingworks/basics';
import { allContestOptions } from '@votingworks/utils';

function rankMarkStatus(markStatus: MarkStatus): number {
  switch (markStatus) {
    case MarkStatus.Marked:
      return 2;
    case MarkStatus.Marginal:
      return 1;
    case MarkStatus.Unmarked:
      return 0;
    default:
      /* istanbul ignore next */
      throwIllegalValue(markStatus);
  }
}

function compareMarkStatusDescending(
  markStatusA: MarkStatus,
  markStatusB: MarkStatus
): number {
  return rankMarkStatus(markStatusB) - rankMarkStatus(markStatusA);
}

function getExpectedVoteCount(contest: Contest): number {
  switch (contest.type) {
    case 'candidate':
      return contest.seats;
    case 'yesno': // yes or no
    case 'straight-party':
      return 1;
    default:
      /* istanbul ignore next */
      throwIllegalValue(contest, 'type');
  }
}

/**
 * Enumerates all the reasons a series of contests might need adjudication in
 * the context of a BMD.
 */
export function getAllPossibleAdjudicationReasonsForBmdVotes(
  contests: readonly Contest[],
  votes: VotesDict
): AdjudicationReasonInfo[] {
  const reasons: AdjudicationReasonInfo[] = [];
  let isBlankBallot = true;

  for (const contest of contests) {
    const expectedSelectionCount = getExpectedVoteCount(contest);
    const actualVotes = votes[contest.id] ?? [];

    const actualVoteCount = actualVotes.length;

    if (isBlankBallot && actualVoteCount > 0) {
      isBlankBallot = false;
    }

    // Check for undervotes
    if (actualVoteCount < expectedSelectionCount) {
      const optionIds = actualVotes.map((option) =>
        typeof option === 'string' ? option : option.id
      );
      reasons.push({
        type: AdjudicationReason.Undervote,
        contestId: contest.id,
        expected: expectedSelectionCount,
        optionIds,
      });
    }
  }

  if (isBlankBallot) {
    reasons.push({
      type: AdjudicationReason.BlankBallot,
    });
  }
  return reasons;
}

/**
 * Enumerates all the reasons a series of contests might need adjudication in
 * the context of a HMPB.
 */
export function getAllPossibleAdjudicationReasons(
  contests: readonly Contest[],
  allScoredContestOptions: Array<{
    option: ContestOption;
    markStatus: MarkStatus;
    writeInAreaStatus: WriteInAreaStatus;
  }>,
  ballotStyle: BallotStyle
): AdjudicationReasonInfo[] {
  if (contests.length === 0) return [];

  const reasons: AdjudicationReasonInfo[] = [];

  let isBlankBallot = true;

  for (const contest of contests) {
    const scoredContestOptions = allScoredContestOptions.filter(
      (scoredContestOption) =>
        scoredContestOption.option.contestId === contest.id
    );

    const selectedContestOptions: Array<{
      id: ContestOption['id'];
    }> = [];

    const unmarkedWriteInContestOptions: Array<{
      id: ContestOption['id'];
    }> = [];

    for (const option of allContestOptions(contest, ballotStyle)) {
      // there may be multiple scores for a given contest option if they have
      // multiple positions on the ballot, such as a candidate endorsed by
      // two candidates.
      const optionScores = scoredContestOptions
        .filter(
          (scoredContestOption) => scoredContestOption.option.id === option.id
        )
        .sort((scoredContestOptionA, scoredContestOptionB) =>
          compareMarkStatusDescending(
            scoredContestOptionA.markStatus,
            scoredContestOptionB.markStatus
          )
        );
      const optionScore = assertDefined(optionScores[0]);

      const { markStatus, writeInAreaStatus } = optionScore;
      switch (markStatus) {
        case MarkStatus.Marginal:
          reasons.push({
            type: AdjudicationReason.MarginalMark,
            contestId: option.contestId,
            optionId: option.id,
          });
          break;

        case MarkStatus.Marked:
          selectedContestOptions.push({
            id: option.id,
          });
          isBlankBallot = false;

          break;

        case MarkStatus.Unmarked:
          break;

        // istanbul ignore next
        default:
          throwIllegalValue(markStatus);
      }

      if (
        markStatus !== MarkStatus.Marked &&
        writeInAreaStatus === WriteInAreaStatus.Filled
      ) {
        unmarkedWriteInContestOptions.push({
          id: option.id,
        });
      }
    }

    const expectedSelectionCount = getExpectedVoteCount(contest);

    if (selectedContestOptions.length < expectedSelectionCount) {
      reasons.push({
        type: AdjudicationReason.Undervote,
        contestId: contest.id,
        optionIds: selectedContestOptions.map(({ id }) => id),
        expected: expectedSelectionCount,
      });
    }

    const selectedAndUnmarkedWriteInContestOptions = [
      ...selectedContestOptions,
      ...unmarkedWriteInContestOptions,
    ];
    if (
      selectedAndUnmarkedWriteInContestOptions.length > expectedSelectionCount
    ) {
      reasons.push({
        type: AdjudicationReason.Overvote,
        contestId: contest.id,
        optionIds: selectedAndUnmarkedWriteInContestOptions.map(({ id }) => id),
        expected: expectedSelectionCount,
      });
    }
  }

  if (isBlankBallot) {
    reasons.push({
      type: AdjudicationReason.BlankBallot,
    });
  }

  return reasons;
}
