import { YesNoVote } from '@votingworks/types'
import { YesOrNo } from '../config/types'

// eslint-disable-next-line import/prefer-default-export
export function getSingleYesNoVote(vote?: YesNoVote): YesOrNo | undefined {
  if (vote?.length === 1) {
    return vote[0]
  }
}
