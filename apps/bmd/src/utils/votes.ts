import { YesNoVote } from '@votingworks/types'
import { YesOrNo } from '../config/types'

export function getSingleYesNoVote(vote?: YesNoVote): YesOrNo | undefined {
  if (vote?.length === 1) {
    return vote[0]
  }
}
