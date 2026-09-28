import type { EnumValues } from '@votingworks/basics';
import type { Voter } from '@votingworks/types';

export const PollbookConnectionStatus = {
  Connected: 'Connected',
  ShutDown: 'ShutDown',
  LostConnection: 'LostConnection',
  MismatchedConfiguration: 'MismatchedConfiguration',
  IncompatibleSoftwareVersion: 'IncompatibleSoftwareVersion',
} as const;

export type PollbookConnectionStatus = EnumValues<
  typeof PollbookConnectionStatus
>;

export function getVoterPrecinct(voter: Voter): string {
  if (voter.addressChange) {
    return voter.addressChange.precinct;
  }
  return voter.precinct;
}
