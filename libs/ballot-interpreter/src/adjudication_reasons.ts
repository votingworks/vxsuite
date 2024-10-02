import {
  AdjudicationReason,
  AdjudicationReasonInfo,
  AnyContest,
  CandidateVote,
  ContestOption,
  ContestOptionId,
  Contests,
  MarkStatus,
  VotesDict,
  WriteInAreaStatus,
  YesNoVote,
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
    /* istanbul ignore next */
    default:
      throwIllegalValue(markStatus);
  }
}

function compareMarkStatusDescending(
  markStatusA: MarkStatus,
  markStatusB: MarkStatus
): number {
  return rankMarkStatus(markStatusB) - rankMarkStatus(markStatusA);
}

function getExpectedVoteCount(contest: AnyContest): number {
  switch (contest.type) {
    case 'candidate':
      return contest.seats;
    case 'yesno': // yes or no
      return 1;
    // istanbul ignore next
    default:
      throwIllegalValue(contest, 'type');
  }
}

/**
 * Enumerates all the reasons a series of contests might need adjudication in
 * the context of a BMD.
 */
export function getAllPossibleAdjudicationReasonsForBmdVotes(
  contests: Contests,
  votes: VotesDict
): AdjudicationReasonInfo[] {
  const reasons: AdjudicationReasonInfo[] = [];
  let isBlankBallot = true;

  for (const contest of contests) {
    const expectedSelectionCount = getExpectedVoteCount(contest);
    const actualVotes = assertDefined(votes[contest.id]);

    const actualVoteCount = actualVotes.length;

    if (isBlankBallot && actualVoteCount > 0) {
      isBlankBallot = false;
    }

    if (actualVoteCount < expectedSelectionCount) {
      const optionIds: string[] = [];
      const contestType = contest.type;
      switch (contestType) {
        case 'candidate':
          for (const option of actualVotes as CandidateVote) {
            optionIds.push(option.id);
          }
          break;
        case 'yesno':
          for (const option of actualVotes as YesNoVote) {
            optionIds.push(option);
          }
          break;
        default:
          /* istanbul ignore next */
          throwIllegalValue(contestType);
      }

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
  contests: Contests,
  allScoredContestOptions: Array<{
    option: ContestOption;
    markStatus: MarkStatus;
    writeInAreaStatus: WriteInAreaStatus;
  }>
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

    for (const option of allContestOptions(contest)) {
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

function optionIdsAsSentence(optionIds: readonly ContestOptionId[]) {
  return optionIds.length
    ? `${optionIds.length}: ${optionIds.map((id) => `'${id}'`).join(', ')}`
    : 'none';
}

export function adjudicationReasonDescription(
  reason: AdjudicationReasonInfo
): string {
  switch (reason.type) {
    case AdjudicationReason.MarginalMark:
      return `Contest '${reason.contestId}' has a marginal mark for option '${reason.optionId}'.`;

    case AdjudicationReason.Overvote:
      return `Contest '${reason.contestId}' is overvoted, expected ${
        reason.expected
      } but got ${optionIdsAsSentence(reason.optionIds)}.`;

    case AdjudicationReason.Undervote:
      return `Contest '${reason.contestId}' is undervoted, expected ${
        reason.expected
      } but got ${optionIdsAsSentence(reason.optionIds)}.`;

    case AdjudicationReason.BlankBallot:
      return `Ballot has no votes.`;

    // istanbul ignore next
    default:
      throwIllegalValue(reason);
  }
}
