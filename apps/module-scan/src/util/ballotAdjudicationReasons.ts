import { Contest, Contests } from '@votingworks/ballot-encoder'
import { ContestOption, MarkStatus } from '../types'
import allContestOptions from './allContestOptions'

export enum AdjudicationReasonType {
  UninterpretableBallot = 'UninterpretableBallot',
  MarginalMark = 'MarginalMark',
  Overvote = 'Overvote',
  Undervote = 'Undervote',
  WriteIn = 'WriteIn',
}

export type AdjudicationReason =
  | UninterpretableBallotAdjudicationReason
  | MarginalMarkAdjudicationReason
  | OvervoteAdjudicationReason
  | UndervoteAdjudicationReason
  | WriteInAdjudicationReason

export interface UninterpretableBallotAdjudicationReason {
  type: AdjudicationReasonType.UninterpretableBallot
}

export interface MarginalMarkAdjudicationReason {
  type: AdjudicationReasonType.MarginalMark
  contestId: Contest['id']
  optionId: ContestOption['id']
}

export interface OvervoteAdjudicationReason {
  type: AdjudicationReasonType.Overvote
  contestId: Contest['id']
  optionIds: readonly ContestOption['id'][]
  expected: number
}

export interface UndervoteAdjudicationReason {
  type: AdjudicationReasonType.Undervote
  contestId: Contest['id']
  optionIds: readonly ContestOption['id'][]
  expected: number
}

export interface WriteInAdjudicationReason {
  type: AdjudicationReasonType.WriteIn
  contestId: Contest['id']
  optionId: ContestOption['id']
}

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
): Generator<AdjudicationReason> {
  if (!contests) {
    yield {
      type: AdjudicationReasonType.UninterpretableBallot,
    }
  } else {
    for (const contest of contests) {
      const selectedOptionIds: ContestOption['id'][] = []

      for (const option of allContestOptions(contest)) {
        switch (optionMarkStatus(contest.id, option.id)) {
          case MarkStatus.Marginal:
            yield {
              type: AdjudicationReasonType.MarginalMark,
              contestId: contest.id,
              optionId: option.id,
            }
            break

          case MarkStatus.Marked:
            selectedOptionIds.push(option.id)

            if (option.type === 'candidate' && option.isWriteIn) {
              yield {
                type: AdjudicationReasonType.WriteIn,
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
          type: AdjudicationReasonType.Undervote,
          contestId: contest.id,
          optionIds: selectedOptionIds,
          expected: expectedSelectionCount,
        }
      } else if (selectedOptionIds.length > expectedSelectionCount) {
        yield {
          type: AdjudicationReasonType.Overvote,
          contestId: contest.id,
          optionIds: selectedOptionIds,
          expected: expectedSelectionCount,
        }
      }
    }
  }
}

export function adjudicationReasonDescription(
  reason: AdjudicationReason
): string {
  switch (reason.type) {
    case AdjudicationReasonType.UninterpretableBallot:
      return 'The ballot could not be interpreted at all, possibly due to a bad scan.'

    case AdjudicationReasonType.MarginalMark:
      return `Contest '${reason.contestId}' has a marginal mark for option '${reason.optionId}'.`

    case AdjudicationReasonType.Overvote:
      return `Contest '${reason.contestId}' is overvoted, expected ${
        reason.expected
      } but got ${
        reason.optionIds.length
          ? `${reason.optionIds.length}: ${reason.optionIds
              .map((id) => `'${id}'`)
              .join(', ')}`
          : 'none'
      }.`

    case AdjudicationReasonType.Undervote:
      return `Contest '${reason.contestId}' is undervoted, expected ${
        reason.expected
      } but got ${
        reason.optionIds.length
          ? `${reason.optionIds.length}: ${reason.optionIds
              .map((id) => `'${id}'`)
              .join(', ')}`
          : 'none'
      }.`

    case AdjudicationReasonType.WriteIn:
      return `Contest '${reason.contestId}' has a write-in.`
  }
}
