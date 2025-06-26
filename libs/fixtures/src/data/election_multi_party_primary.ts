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

export const pollbookCityVoters = builders.file(
  'data/electionMultiPartyPrimary/voters.csv'
);
export const pollbookCityStreetNames = builders.file(
  'data/electionMultiPartyPrimary/streetNames.csv'
);
