import {
  AdjudicationReason,
  AdjudicationReasonInfo,
  Contest,
  ContestOption,
  ContestOptionId,
  Contests,
  MarkStatus,
} from '@votingworks/types';
import { allContestOptions } from './all_contest_options';
import { throwIllegalValue } from '../assert';

export interface Options {
  optionMarkStatus: (option: ContestOption) => MarkStatus;
}

/**
 * Enumerates all the reasons a series of contests might need adjudication.
 * Callers must provide a function that can get the mark status for any contest
 * option in the contests given.
 */
export function* ballotAdjudicationReasons(
  contests: Contests | undefined,
  { optionMarkStatus }: Options
): Generator<AdjudicationReasonInfo> {
  if (!contests) {
    yield {
      type: AdjudicationReason.UninterpretableBallot,
    };
  } else if (contests.length === 0) {
    // This page is intentionally blank.
  } else {
    let isBlankBallot = true;

    for (const contest of contests) {
      const selectedOptionsByContestId = new Map<
        Contest['id'],
        Array<{ id: ContestOption['id']; index: number }>
      >();

      for (const option of allContestOptions(contest)) {
        const selectedOptions =
          selectedOptionsByContestId.get(option.contestId) ?? [];
        selectedOptionsByContestId.set(option.contestId, selectedOptions);

        const status = optionMarkStatus(option);
        switch (status) {
          case MarkStatus.Marginal:
            yield {
              type: AdjudicationReason.MarginalMark,
              contestId: option.contestId,
              optionId: option.id,
              optionIndex: option.optionIndex,
            };
            break;

          case MarkStatus.Marked:
            selectedOptions.push({ id: option.id, index: option.optionIndex });
            isBlankBallot = false;

            break;

          case MarkStatus.UnmarkedWriteIn:
          case MarkStatus.Unmarked:
            break;

          /* istanbul ignore next - compile-time completeness check */
          default:
            throwIllegalValue(status);
        }
      }

      for (const [contestId, selectedOptions] of selectedOptionsByContestId) {
        let expectedSelectionCount: number;

        switch (contest.type) {
          case 'candidate':
            expectedSelectionCount = contest.seats;
            break;

          case 'yesno': // yes or no
          case 'ms-either-neither': // either or neither, first or second
            expectedSelectionCount = 1;
            break;

          /* istanbul ignore next - compile-time completeness check */
          default:
            throwIllegalValue(contest, 'type');
        }

        if (selectedOptions.length < expectedSelectionCount) {
          yield {
            type: AdjudicationReason.Undervote,
            contestId,
            optionIds: selectedOptions.map(({ id }) => id),
            optionIndexes: selectedOptions.map(({ index }) => index),
            expected: expectedSelectionCount,
          };
        } else if (selectedOptions.length > expectedSelectionCount) {
          yield {
            type: AdjudicationReason.Overvote,
            contestId,
            optionIds: selectedOptions.map(({ id }) => id),
            optionIndexes: selectedOptions.map(({ index }) => index),
            expected: expectedSelectionCount,
          };
        }
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
    case AdjudicationReason.UninterpretableBallot:
      return 'The ballot could not be interpreted at all, possibly due to a bad scan.';

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

    /* istanbul ignore next - compile-time completeness check */
    default:
      throwIllegalValue(reason);
  }
}
