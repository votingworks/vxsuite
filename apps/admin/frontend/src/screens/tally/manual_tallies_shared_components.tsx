import type { ManualResultsVotingMethod } from '@votingworks/admin-backend';
import { assertDefined, find } from '@votingworks/basics';
import { Election, PrecinctId, BallotStyleGroupId } from '@votingworks/types';
import {
  getBallotStyleGroup,
  getPrecinctsAndSplitsForBallotStyle,
} from '@votingworks/utils';

const VOTING_METHOD_LABELS: Record<ManualResultsVotingMethod, string> = {
  absentee: 'Absentee',
  precinct: 'Precinct',
};

export function VotingMethodLabel({
  votingMethod,
}: {
  votingMethod: ManualResultsVotingMethod;
}): string {
  return VOTING_METHOD_LABELS[votingMethod];
}

export function BallotStyleLabel({
  election,
  precinctId,
  ballotStyleGroupId,
}: {
  election: Election;
  precinctId: PrecinctId;
  ballotStyleGroupId: BallotStyleGroupId;
}): string {
  const ballotStyleGroup = assertDefined(
    getBallotStyleGroup({
      election,
      ballotStyleGroupId,
    })
  );
  const precinctOrSplit = find(
    getPrecinctsAndSplitsForBallotStyle({
      election,
      ballotStyle: ballotStyleGroup.defaultLanguageBallotStyle,
    }),
    (ps) => ps.precinct.id === precinctId
  );
  return (
    (precinctOrSplit.split?.name || precinctOrSplit.precinct.name) +
    (ballotStyleGroup.partyId
      ? ` - ${
          find(election.parties, (p) => p.id === ballotStyleGroup.partyId).name
        }`
      : '')
  );
}
