import * as builders from '../builders.js';

export const electionJson = builders.election(
  'data/electionCombinedBallotPrimary/election.json'
);
export const { readElection, readElectionDefinition } = electionJson;
