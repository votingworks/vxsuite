import { Election } from '@votingworks/types';
import { BallotTemplateId } from '@votingworks/hmpb';
import { FinalizationBlocker } from './types';

export function validateElectionForExport(
  election: Election,
  ballotTemplateId?: BallotTemplateId
): FinalizationBlocker[] {
  const blockers: FinalizationBlocker[] = [];

  // NH ballots require a signature
  if (ballotTemplateId === 'NhBallot' && !election.signature) {
    blockers.push('missingSignature');
  }

  // Basic structural checks that would prevent a successful export
  if (!election.seal || election.seal.trim() === '') {
    blockers.push('missingSeal');
  }

  if (!election.districts || election.districts.length === 0) {
    blockers.push('noDistricts');
  }

  if (!election.contests || election.contests.length === 0) {
    blockers.push('noContests');
  }

  if (!election.precincts || election.precincts.length === 0) {
    blockers.push('noPrecincts');
  }

  if (!election.ballotStyles || election.ballotStyles.length === 0) {
    blockers.push('noBallotStyles');
  }

  return blockers;
}
