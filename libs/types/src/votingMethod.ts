import { VotingMethod } from './tallies';

// duplicated from shared utils library in order to avoid creating a cyclical dependency
function throwIllegalValue(s: never): never {
  throw new Error(`Illegal Value: ${s}`);
}

export function getLabelForVotingMethod(votingMethod: VotingMethod): string {
  switch (votingMethod) {
    case VotingMethod.Precinct:
      return 'Precinct';
    case VotingMethod.Absentee:
      return 'Absentee';
    case VotingMethod.Unknown:
      return 'Other';
    default:
      throwIllegalValue(votingMethod);
  }
}
