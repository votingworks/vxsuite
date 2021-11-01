import {
  AdjudicationReason,
  AdjudicationReasonInfo,
  Contest,
  ContestOption,
  Contests,
  MarkStatus,
} from '@votingworks/types';
import { throwIllegalValue } from '@votingworks/utils';
import { strict as assert } from 'assert';
import { allContestOptions } from './allContestOptions';

export interface Options {
  optionMarkStatus: (
    contestId: Contest['id'],
    optionId: ContestOption['id']
  ) => MarkStatus;
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

        const status = optionMarkStatus(option.contestId, option.id);
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

            if (option.type === 'candidate' && option.isWriteIn) {
              yield {
                type: AdjudicationReason.WriteIn,
                contestId: option.contestId,
                optionId: option.id,
                optionIndex: option.optionIndex,
              };
            }
            break;

          case MarkStatus.UnmarkedWriteIn:
            assert.equal(option.type, 'candidate' as const);
            assert(option.isWriteIn);

            yield {
              type: AdjudicationReason.UnmarkedWriteIn,
              contestId: option.contestId,
              optionId: option.id,
              optionIndex: option.optionIndex,
            };
            break;

          case MarkStatus.Unmarked:
            break;

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
      } but got ${
        reason.optionIds.length
          ? `${reason.optionIds.length}: ${reason.optionIds
              .map((id) => `'${id}'`)
              .join(', ')}`
          : 'none'
      }.`;

    case AdjudicationReason.Undervote:
      return `Contest '${reason.contestId}' is undervoted, expected ${
        reason.expected
      } but got ${
        reason.optionIds.length
          ? `${reason.optionIds.length}: ${reason.optionIds
              .map((id) => `'${id}'`)
              .join(', ')}`
          : 'none'
      }.`;

    case AdjudicationReason.WriteIn:
      return `Contest '${reason.contestId}' has a write-in.`;

    case AdjudicationReason.UnmarkedWriteIn:
      return `Contest '${reason.contestId}' has an unmarked write-in.`;

    case AdjudicationReason.BlankBallot:
      return `Ballot has no votes.`;

    default:
      throwIllegalValue(reason);
  }
}
