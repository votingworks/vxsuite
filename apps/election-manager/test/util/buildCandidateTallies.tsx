import { CandidateContest, Dictionary } from '@votingworks/types'
import { ContestOptionTally } from '../../src/config/types'

export function buildCandidateTallies(
  multiplier: number,
  contest: CandidateContest
): Dictionary<ContestOptionTally> {
  const results: Dictionary<ContestOptionTally> = {}
  let index = 0
  contest.candidates.forEach((c) => {
    results[c.id] = {
      option: c,
      tally: index * multiplier,
    }
    index += 1
  })
  return results
}
