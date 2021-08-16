import {
  AdjudicationReason,
  AdjudicationReasonInfo,
  Contest,
  ContestOption,
  Contests,
} from '@votingworks/types'
import { MarkStatus } from '../types'
import allContestOptions from './allContestOptions'

export interface Options {
  optionMarkStatus: (
    contestId: Contest['id'],
    optionId: ContestOption['id']
  ) => MarkStatus
}

/**
 * Enumerates all the reasons a series of contests might need adjudication.
 * Callers must provide a function that can get the mark status for any contest
 * option in the contests given.
 */
export default function* ballotAdjudicationReasons(
  contests: Contests | undefined,
  { optionMarkStatus }: Options
): Generator<AdjudicationReasonInfo> {
  if (!contests) {
    yield {
      type: AdjudicationReason.UninterpretableBallot,
    }
  } else if (contests.length === 0) {
    // This page is intentionally blank.
    return
  } else {
    let isBlankBallot = true

    for (const contest of contests) {
      const selectedOptionIdsByContestId = new Map<
        Contest['id'],
        ContestOption['id'][]
      >()

      for (const option of allContestOptions(contest)) {
        const selectedOptionIds =
          selectedOptionIdsByContestId.get(option.contestId) ?? []
        selectedOptionIdsByContestId.set(option.contestId, selectedOptionIds)

        switch (optionMarkStatus(option.contestId, option.id)) {
          case MarkStatus.Marginal:
            yield {
              type: AdjudicationReason.MarginalMark,
              contestId: option.contestId,
              optionId: option.id,
            }
            break

          case MarkStatus.Marked:
            selectedOptionIds.push(option.id)
            isBlankBallot = false

            if (option.type === 'candidate' && option.isWriteIn) {
              yield {
                type: AdjudicationReason.WriteIn,
                contestId: option.contestId,
                optionId: option.id,
              }
            }
        }
      }

      for (const [
        contestId,
        selectedOptionIds,
      ] of selectedOptionIdsByContestId) {
        let expectedSelectionCount: number

        switch (contest.type) {
          case 'candidate':
            expectedSelectionCount = contest.seats
            break

          case 'yesno': // yes or no
          case 'ms-either-neither': // either or neither, first or second
            expectedSelectionCount = 1
            break

          default:
            throw new Error(
              // @ts-expect-error - `contest` is of type `never` since we exhausted all branches, in theory
              `contest type is not yet supported: ${contest.type}`
            )
        }

        if (selectedOptionIds.length < expectedSelectionCount) {
          yield {
            type: AdjudicationReason.Undervote,
            contestId: contestId,
            optionIds: selectedOptionIds,
            expected: expectedSelectionCount,
          }
        } else if (selectedOptionIds.length > expectedSelectionCount) {
          yield {
            type: AdjudicationReason.Overvote,
            contestId: contestId,
            optionIds: selectedOptionIds,
            expected: expectedSelectionCount,
          }
        }
      }
    }

    if (isBlankBallot) {
      yield {
        type: AdjudicationReason.BlankBallot,
      }
    }
  }
}

export function adjudicationReasonDescription(
  reason: AdjudicationReasonInfo
): string {
  switch (reason.type) {
    case AdjudicationReason.UninterpretableBallot:
      return 'The ballot could not be interpreted at all, possibly due to a bad scan.'

    case AdjudicationReason.MarginalMark:
      return `Contest '${reason.contestId}' has a marginal mark for option '${reason.optionId}'.`

    case AdjudicationReason.Overvote:
      return `Contest '${reason.contestId}' is overvoted, expected ${
        reason.expected
      } but got ${
        reason.optionIds.length
          ? `${reason.optionIds.length}: ${reason.optionIds
              .map((id) => `'${id}'`)
              .join(', ')}`
          : 'none'
      }.`

    case AdjudicationReason.Undervote:
      return `Contest '${reason.contestId}' is undervoted, expected ${
        reason.expected
      } but got ${
        reason.optionIds.length
          ? `${reason.optionIds.length}: ${reason.optionIds
              .map((id) => `'${id}'`)
              .join(', ')}`
          : 'none'
      }.`

    case AdjudicationReason.WriteIn:
      return `Contest '${reason.contestId}' has a write-in.`

    case AdjudicationReason.BlankBallot:
      return `Ballot has no votes.`
  }
}
