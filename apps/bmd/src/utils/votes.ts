import { YesNoVote } from '@votingworks/ballot-encoder'
import { YesNo } from '../config/types'

// eslint-disable-next-line import/prefer-default-export
export function getSingleYesNoVote(vote?: YesNoVote): YesNo | undefined {
  if (vote?.length === 1) {
    return vote[0]
  }
}
