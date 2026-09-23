import * as builders from '../builders.js';

const electionJson = builders.election(
  'data/electionStraightParty/election.json'
);
export const { readElection, readElectionDefinition } = electionJson;
