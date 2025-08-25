import * as builders from '../builders';

const batchResults = builders.file(
  'data/electionMultiPartyPrimary/csvFiles/batchResults.csv'
);
export const csvData = batchResults.asText();

const semsFilesStandard = builders.file(
  'data/electionMultiPartyPrimary/semsFiles/standard.csv'
);
export const semsData = semsFilesStandard.asText();

export const { readElection, readElectionDefinition } = builders.election(
  'data/electionMultiPartyPrimary/election.json'
);

export const electionJson = builders.election(
  'data/electionMultiPartyPrimary/election.json'
);

/**
 * Randomly generated voter data for this election. Specifics of this file will change upon regeneration and any
 * tests using this data should not test for anything specific about a specific voter.
 */
export const pollbookCityVoters = builders.file(
  'data/electionMultiPartyPrimary/voters.csv'
);

/**
 * Randomly generated street name data for this election. Specifics of this file will change upon regeneration and any
 * tests using this data should not test for anything specific about the valid streets.
 */
export const pollbookCityStreetNames = builders.file(
  'data/electionMultiPartyPrimary/streetNames.csv'
);
