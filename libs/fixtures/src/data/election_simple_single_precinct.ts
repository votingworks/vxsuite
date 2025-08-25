import * as builders from '../builders';

/**
 * Note: This is an election equivalent to the BASE_DEPRECATED version in the other fixtures and does
 * not contain grid layouts, translations, etc. It is used for testing with VxPollBook to test a simplified election
 * definition for a non-vxsuite user. If testing with vxsuite you should set up this base election to generate an election package
 * in libs/fixture-generators before using.
 */
export const electionSinglePrecinctBase = builders.election(
  'data/electionSimpleSinglePrecinct/election.json'
);
export const { readElection, readElectionDefinition } =
  electionSinglePrecinctBase;

/**
 * Randomly generated voter data for this election. Specifics of this file will change upon regeneration and any
 * tests using this data should not test for anything specific about a specific voter.
 */
export const pollbookTownVoters = builders.file(
  'data/electionSimpleSinglePrecinct/voters.csv'
);

/**
 * Randomly generated street name data for this election. Specifics of this file will change upon regeneration and any
 * tests using this data should not test for anything specific about the valid streets.
 */
export const pollbookTownStreetNames = builders.file(
  'data/electionSimpleSinglePrecinct/streetNames.csv'
);
