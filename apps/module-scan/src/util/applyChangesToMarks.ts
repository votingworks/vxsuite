import { BallotMark } from '@votingworks/hmpb-interpreter'
import { getMarkStatus } from '../types'
import { MarksByContestId } from '../types/ballot-review'

export default function applyChangesToMarks(
  original: readonly BallotMark[],
  ...changes: MarksByContestId[]
): MarksByContestId {
  const result: MarksByContestId = {}

  for (const mark of original) {
    if (mark.type !== 'stray') {
      const contestId = mark.contest.id
      const optionId =
        typeof mark.option === 'string' ? mark.option : mark.option.id
      const originalMark = getMarkStatus(mark)
      const reduced = changes.reduce(
        (last, change) => change[contestId]?.[optionId] ?? last,
        originalMark
      )

      if (reduced !== originalMark) {
        result[contestId] = {
          ...result[contestId],
          [optionId]: reduced,
        }
      }
    }
  }

  return result
}
