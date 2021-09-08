import { Election } from '@votingworks/types'
import {
  buildVoteFromCvr,
  SerializedTally,
  getZeroTally,
  calculateTally,
} from '@votingworks/utils'
import { CastVoteRecord } from '../config/types'

// TODO build this incrementally vote by vote rather than calculating all at once.
export function calculateTallyFromCVRs(
  castVoteRecords: CastVoteRecord[],
  election: Election
): SerializedTally {
  let tally = getZeroTally(election)
  for (const cvr of castVoteRecords) {
    const nextVote = buildVoteFromCvr({ election, cvr })
    tally = calculateTally({
      election,
      tally,
      votes: nextVote,
      ballotStyleId: cvr._ballotStyleId,
    })
  }
  return tally
}
