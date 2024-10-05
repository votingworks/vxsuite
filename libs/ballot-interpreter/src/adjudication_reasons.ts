import {
  AdjudicationReason,
  AdjudicationReasonInfo,
  ContestOption,
  ContestOptionId,
  Contests,
  MarkStatus,
  WriteInAreaStatus,
} from '@votingworks/types';
import { find, throwIllegalValue } from '@votingworks/basics';
import { allContestOptions } from '@votingworks/utils';

/**
 * Enumerates all the reasons a series of contests might need adjudication.
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
      const optionScore = find(
        scoredContestOptions,
        (scoredContestOption) => scoredContestOption.option.id === option.id
      );
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

    let expectedSelectionCount: number;

    switch (contest.type) {
      case 'candidate':
        expectedSelectionCount = contest.seats;
        break;

      case 'yesno': // yes or no
        expectedSelectionCount = 1;
        break;

      // istanbul ignore next
      default:
        throwIllegalValue(contest, 'type');
    }

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
