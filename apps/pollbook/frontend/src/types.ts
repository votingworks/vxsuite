import type { Voter } from '@votingworks/types';

export enum PollbookConnectionStatus {
  Connected = 'Connected',
  ShutDown = 'ShutDown',
  LostConnection = 'LostConnection',
  MismatchedConfiguration = 'MismatchedConfiguration',
  IncompatibleSoftwareVersion = 'IncompatibleSoftwareVersion',
}

export function getVoterPrecinct(voter: Voter): string {
  if (voter.addressChange) {
    return voter.addressChange.precinct;
  }
  return voter.precinct;
}
