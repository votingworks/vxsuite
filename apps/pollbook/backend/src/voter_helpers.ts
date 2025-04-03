import { Voter } from './types';

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
