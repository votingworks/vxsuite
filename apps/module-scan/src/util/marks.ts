import { MarkThresholds } from '@votingworks/ballot-encoder'
import { BallotMark } from '@votingworks/hmpb-interpreter'
import { getMarkStatus } from '../types'
import { MarksByContestId, MarksByOptionId } from '../types/ballot-review'

/**
 * Merges a list of changes to an original set of marks into each other,
 * returning the smallest difference from the original that contains the final
 * state.
 */
export function mergeChanges(
  original: MarksByContestId,
  ...changes: readonly MarksByContestId[]
): MarksByContestId {
  const result: MarksByContestId = {}

  for (const change of changes) {
    for (const contestId of Object.keys({ ...original, ...change })) {
      const contestOptions: MarksByOptionId = result[contestId] ?? {}

      for (const optionId of Object.keys({
        ...original[contestId],
        ...change[contestId],
      })) {
        const changeMark = change[contestId]?.[optionId]
        const originalMark = original[contestId]?.[optionId]

        if (typeof changeMark !== 'undefined') {
          if (changeMark !== originalMark) {
            contestOptions[optionId] = changeMark
          } else {
            delete contestOptions[optionId]
          }
        }
      }

      if (Object.keys(contestOptions).length > 0) {
        result[contestId] = contestOptions
      } else {
        delete result[contestId]
      }
    }
  }

  return result
}

/**
 * Builds a contest option mark change object from a set of marks.
 */
export function changesFromMarks(
  marks: readonly BallotMark[],
  markThresholds: MarkThresholds
): MarksByContestId {
  const result: MarksByContestId = {}

  for (const mark of marks) {
    if (mark.type === 'stray') {
      continue
    }

    if (mark.type !== 'candidate' && mark.type !== 'yesno') {
      throw new Error(`contest type is not yet supported: ${mark.type}`)
    }

    result[mark.contest.id] = {
      ...result[mark.contest.id],
      [mark.type === 'candidate' ? mark.option.id : mark.option]: getMarkStatus(
        mark,
        markThresholds
      ),
    }
  }

  return result
}
