import * as builders from '../builders';

export const electionJson = builders.election(
  'data/electionCombinedBallotPrimary/election.json'
);
export const { readElection, readElectionDefinition } = electionJson;
