import { Voter, VoterNameChangeRequest } from './types';

export function getUpdatedVoterFirstName(voter: Voter): string {
  if (voter.nameChange) {
    return voter.nameChange.firstName;
  }
  return voter.firstName;
}

export function getUpdatedVoterLastName(voter: Voter): string {
  if (voter.nameChange) {
    return voter.nameChange.lastName;
  }
  return voter.lastName;
}

export function isVoterNameChangeValid(
  nameChange: VoterNameChangeRequest
): boolean {
  return nameChange.firstName.length > 0 && nameChange.lastName.length > 0;
}
