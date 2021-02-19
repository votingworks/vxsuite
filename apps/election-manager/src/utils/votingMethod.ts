import { VotingMethod } from '../config/types'
import throwIllegalValue from './throwIllegalValue'

// eslint-disable-next-line import/prefer-default-export
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
