import { throwIllegalValue } from '@votingworks/utils'
import { VotingMethod } from '@votingworks/types'

export function getLabelForVotingMethod(votingMethod: VotingMethod): string {
  switch (votingMethod) {
    case VotingMethod.Precinct:
      return 'Precinct'
    case VotingMethod.Absentee:
      return 'Absentee'
    case VotingMethod.Unknown:
      return 'Other'
    default:
      throwIllegalValue(votingMethod)
  }
}
