import { AnyContest } from '@votingworks/ballot-encoder'
import { ContestOption } from '../types'

/**
 * Enumerates all contest options in the order they would appear on a HMPB.
 */
export default function* allContestOptions(
  contest: AnyContest
): Generator<ContestOption> {
  if (contest.type === 'candidate') {
    for (const candidate of contest.candidates) {
      yield {
        type: 'candidate',
        id: candidate.id,
        name: candidate.name,
        isWriteIn: false,
      }
    }

    if (contest.allowWriteIns) {
      for (let i = 0; i < contest.seats; i++) {
        yield {
          type: 'candidate',
          id: `__write-in-${i}`,
          name: 'Write-In',
          isWriteIn: true,
        }
      }
    }
  } else if (contest.type === 'yesno') {
    yield {
      type: 'yesno',
      id: 'yes',
      name: 'Yes',
    }
    yield {
      type: 'yesno',
      id: 'no',
      name: 'No',
    }
  } else {
    throw new Error(`contest type is not yet supported: ${contest.type}`)
  }
}
