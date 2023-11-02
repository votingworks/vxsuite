import {
  AdjudicationReason,
  AdjudicationReasonInfo,
  ContestOption,
  ContestOptionId,
  Contests,
  MarkStatus,
  WriteInAreaStatus,
} from '@votingworks/types';
import { throwIllegalValue } from '@votingworks/basics';
import { allContestOptions } from './all_contest_options';

export interface Options {
  optionStatus: (option: ContestOption) => {
    markStatus: MarkStatus;
    writeInAreaStatus: WriteInAreaStatus;
  };
}

/**
 * Enumerates all the reasons a series of contests might need adjudication.
 * Callers must provide a function that can get the mark status and write-in
 * area status for any contest option in the contests given.
 */
export function* ballotAdjudicationReasons(
  contests: Contests,
  { optionStatus }: Options
): Generator<AdjudicationReasonInfo> {
  if (contests.length === 0) {
    // This page is intentionally blank.
  } else {
    let isBlankBallot = true;

    for (const contest of contests) {
      const selectedContestOptions: Array<{
        id: ContestOption['id'];
        index: number;
      }> = [];

      const unmarkedWriteInContestOptions: Array<{
        id: ContestOption['id'];
        index: number;
      }> = [];

      for (const option of allContestOptions(contest)) {
        const { markStatus, writeInAreaStatus } = optionStatus(option);
        switch (markStatus) {
          case MarkStatus.Marginal:
            yield {
              type: AdjudicationReason.MarginalMark,
              contestId: option.contestId,
              optionId: option.id,
              optionIndex: option.optionIndex,
            };
            break;

          case MarkStatus.Marked:
            selectedContestOptions.push({
              id: option.id,
              index: option.optionIndex,
            });
            isBlankBallot = false;

            break;

          case MarkStatus.Unmarked:
            break;

          /* c8 ignore next 2 */
          default:
            throwIllegalValue(markStatus);
        }

        if (
          markStatus !== MarkStatus.Marked &&
          writeInAreaStatus === 'filled'
        ) {
          unmarkedWriteInContestOptions.push({
            id: option.id,
            index: option.optionIndex,
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

        /* c8 ignore next 2 */
        default:
          throwIllegalValue(contest, 'type');
      }

      if (selectedContestOptions.length < expectedSelectionCount) {
        yield {
          type: AdjudicationReason.Undervote,
          contestId: contest.id,
          optionIds: selectedContestOptions.map(({ id }) => id),
          optionIndexes: selectedContestOptions.map(({ index }) => index),
          expected: expectedSelectionCount,
        };
      }

      const selectedAndUnmarkedWriteInContestOptions = [
        ...selectedContestOptions,
        ...unmarkedWriteInContestOptions,
      ];
      if (
        selectedAndUnmarkedWriteInContestOptions.length > expectedSelectionCount
      ) {
        yield {
          type: AdjudicationReason.Overvote,
          contestId: contest.id,
          optionIds: selectedAndUnmarkedWriteInContestOptions.map(
            ({ id }) => id
          ),
          optionIndexes: selectedAndUnmarkedWriteInContestOptions.map(
            ({ index }) => index
          ),
          expected: expectedSelectionCount,
        };
      }
    }

    if (isBlankBallot) {
      yield {
        type: AdjudicationReason.BlankBallot,
      };
    }
  }
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

    /* c8 ignore next 2 */
    default:
      throwIllegalValue(reason);
  }
}
