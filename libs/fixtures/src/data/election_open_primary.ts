import * as builders from '../builders';

export const electionJson = builders.election(
  'data/electionOpenPrimary/election.json'
);
export const { readElection, readElectionDefinition } = electionJson;
