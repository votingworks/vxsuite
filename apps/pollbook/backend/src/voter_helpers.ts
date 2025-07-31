import { Voter, VoterNameChangeRequest } from '@votingworks/types';

export function getUpdatedVoterFirstName(voter: Voter): string {
  if (voter.nameChange) {
    return voter.nameChange.firstName;
  }
  return voter.firstName;
}

export function getUpdatedVoterMiddleName(voter: Voter): string {
  if (voter.nameChange) {
    return voter.nameChange.middleName;
  }
  return voter.middleName;
}

export function getUpdatedVoterLastName(voter: Voter): string {
  if (voter.nameChange) {
    return voter.nameChange.lastName;
  }
  return voter.lastName;
}

export function getUpdatedVoterSuffix(voter: Voter): string {
  if (voter.nameChange) {
    return voter.nameChange.suffix;
  }
  return voter.suffix;
}

export function isVoterNameChangeValid(
  nameChange: VoterNameChangeRequest
): boolean {
  return nameChange.firstName.length > 0 && nameChange.lastName.length > 0;
}
