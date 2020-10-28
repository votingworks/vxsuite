import { Contest, MarkThresholds } from '@votingworks/ballot-encoder'
import { BallotMark } from '@votingworks/hmpb-interpreter'
import { ContestOption, MarkStatus, getMarkStatus } from '../types'

/**
 * state of the mark for a given contest and option
 */
export default function optionMarkStatus({
  markThresholds,
  marks,
  contestId,
  optionId,
}: {
  markThresholds: MarkThresholds
  marks: BallotMark[]
  contestId: Contest['id']
  optionId: ContestOption['id']
}): MarkStatus {
  for (const mark of marks) {
    if (
      mark.type === 'stray' ||
      (mark.type !== 'ms-either-neither' && mark.contest.id !== contestId)
    ) {
      continue
    }

    // the criteria for ms-either-neither is more complex, handling it in the switch.

    switch (mark.type) {
      case 'ms-either-neither':
        if (mark.contest.eitherNeitherContestId === contestId) {
          if (
            (mark.contest.eitherOption.id === mark.option.id &&
              optionId === 'yes') ||
            (mark.contest.neitherOption.id === mark.option.id &&
              optionId === 'no')
          ) {
            return getMarkStatus(mark, markThresholds)
          }
        }

        if (mark.contest.pickOneContestId === contestId) {
          if (
            (mark.contest.firstOption.id === mark.option.id &&
              optionId === 'yes') ||
            (mark.contest.secondOption.id === mark.option.id &&
              optionId === 'no')
          ) {
            return getMarkStatus(mark, markThresholds)
          }
        }

        break
      case 'candidate':
        if (mark.option.id === optionId) {
          return getMarkStatus(mark, markThresholds)
        }
        break

      case 'yesno':
        if (mark.option === optionId) {
          return getMarkStatus(mark, markThresholds)
        }
        break

      default:
        throw new Error(
          // @ts-expect-error - `mark` is of type `never` since we exhausted all branches, in theory
          `contest type is not yet supported: ${mark.type}`
        )
    }
  }

  return MarkStatus.Unmarked
}
