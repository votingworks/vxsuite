import { AnyContest } from '@votingworks/types'
import { ContestOption } from '../types'

/**
 * Enumerates all contest options in the order they would appear on a HMPB.
 */
export default function* allContestOptions(
  contest: AnyContest,
  writeInOptionIds?: readonly string[]
): Generator<ContestOption> {
  if (contest.type === 'candidate') {
    for (const candidate of contest.candidates) {
      yield {
        type: 'candidate',
        id: candidate.id,
        contestId: contest.id,
        name: candidate.name,
        isWriteIn: false,
      }
    }

    if (contest.allowWriteIns) {
      if (writeInOptionIds !== undefined) {
        for (const writeInId of writeInOptionIds) {
          yield {
            type: 'candidate',
            id: writeInId,
            contestId: contest.id,
            name: 'Write-In',
            isWriteIn: true,
          }
        }
      } else {
        for (let i = 0; i < contest.seats; i++) {
          yield {
            type: 'candidate',
            id: `__write-in-${i}`,
            contestId: contest.id,
            name: 'Write-In',
            isWriteIn: true,
          }
        }
      }
    }
  } else if (contest.type === 'yesno') {
    yield {
      type: 'yesno',
      id: 'yes',
      contestId: contest.id,
      name: 'Yes',
    }
    yield {
      type: 'yesno',
      id: 'no',
      contestId: contest.id,
      name: 'No',
    }
  } else if (contest.type === 'ms-either-neither') {
    yield {
      type: 'ms-either-neither',
      id: 'yes',
      name: contest.eitherOption.label,
      contestId: contest.eitherNeitherContestId,
    }
    yield {
      type: 'ms-either-neither',
      id: 'no',
      name: contest.neitherOption.label,
      contestId: contest.eitherNeitherContestId,
    }
    yield {
      type: 'ms-either-neither',
      id: 'yes',
      name: contest.firstOption.label,
      contestId: contest.pickOneContestId,
    }
    yield {
      type: 'ms-either-neither',
      id: 'no',
      name: contest.secondOption.label,
      contestId: contest.pickOneContestId,
    }
  } else {
    // @ts-expect-error - `contest` is of type `never` since we exhausted all branches, in theory
    throw new Error(`contest type is not yet supported: ${contest.type}`)
  }
}
