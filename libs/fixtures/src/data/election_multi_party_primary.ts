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
  'data/electionMultiPartyPrimary/electionMultiPartyPrimarySample.json'
);
