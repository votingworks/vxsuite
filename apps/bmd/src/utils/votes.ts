import { YesNoVote, YesOrNo } from '@votingworks/types'

export function getSingleYesNoVote(vote?: YesNoVote): YesOrNo | undefined {
  if (vote?.length === 1) {
    return vote[0]
  }
}
