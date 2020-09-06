import {
  AdjudicationReason,
  Contest,
  Contests,
} from '@votingworks/ballot-encoder'
import { ContestOption, MarkStatus } from '../types'
import allContestOptions from './allContestOptions'

export type AdjudicationReasonInfo =
  | UninterpretableBallotAdjudicationReasonInfo
  | MarginalMarkAdjudicationReasonInfo
  | OvervoteAdjudicationReasonInfo
  | UndervoteAdjudicationReasonInfo
  | WriteInAdjudicationReasonInfo
  | BlankBallotAdjudicationReasonInfo

export interface UninterpretableBallotAdjudicationReasonInfo {
  type: AdjudicationReason.UninterpretableBallot
}

export interface MarginalMarkAdjudicationReasonInfo {
  type: AdjudicationReason.MarginalMark
  contestId: Contest['id']
  optionId: ContestOption['id']
}

export interface OvervoteAdjudicationReasonInfo {
  type: AdjudicationReason.Overvote
  contestId: Contest['id']
  optionIds: readonly ContestOption['id'][]
  expected: number
}

export interface UndervoteAdjudicationReasonInfo {
  type: AdjudicationReason.Undervote
  contestId: Contest['id']
  optionIds: readonly ContestOption['id'][]
  expected: number
}

export interface WriteInAdjudicationReasonInfo {
  type: AdjudicationReason.WriteIn
  contestId: Contest['id']
  optionId: ContestOption['id']
}

export interface BlankBallotAdjudicationReasonInfo {
  type: AdjudicationReason.BlankBallot
}

export interface Options {
  optionMarkStatus: (
    contestId: Contest['id'],
    optionId: ContestOption['id']
  ) => MarkStatus
}

// these data structures live here until we can refactor the code
// to be more sheet-oriented and then place them where they belong.
interface ImageInfo {
  url: string
}

interface BallotPageInfo {
  image: ImageInfo
}

export interface BallotSheetInfo {
  id: string
  front: BallotPageInfo
  back: BallotPageInfo
  adjudicationReason?: AdjudicationReason
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
      if (contest.type !== 'candidate' && contest.type !== 'yesno') {
        throw new Error(`contest type is not yet supported: ${contest.type}`)
      }

      const selectedOptionIds: ContestOption['id'][] = []

      for (const option of allContestOptions(contest)) {
        switch (optionMarkStatus(contest.id, option.id)) {
          case MarkStatus.Marginal:
            yield {
              type: AdjudicationReason.MarginalMark,
              contestId: contest.id,
              optionId: option.id,
            }
            break

          case MarkStatus.Marked:
            selectedOptionIds.push(option.id)
            isBlankBallot = false

            if (option.type === 'candidate' && option.isWriteIn) {
              yield {
                type: AdjudicationReason.WriteIn,
                contestId: contest.id,
                optionId: option.id,
              }
            }
        }
      }

      const expectedSelectionCount =
        contest.type === 'candidate' ? contest.seats : 1 // yes or no

      if (selectedOptionIds.length < expectedSelectionCount) {
        yield {
          type: AdjudicationReason.Undervote,
          contestId: contest.id,
          optionIds: selectedOptionIds,
          expected: expectedSelectionCount,
        }
      } else if (selectedOptionIds.length > expectedSelectionCount) {
        yield {
          type: AdjudicationReason.Overvote,
          contestId: contest.id,
          optionIds: selectedOptionIds,
          expected: expectedSelectionCount,
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
