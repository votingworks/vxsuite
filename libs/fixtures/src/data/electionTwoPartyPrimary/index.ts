import path from 'path';
import { Election } from '@votingworks/types';
import { asElectionDefinition } from '../../util';
import { asText as batchResultsCsvAsText } from './csvFiles/batchResults.csv';
import { asText as finalResultsCsvAsText } from './csvFiles/finalResults.csv';
import { election } from './election.json';
import * as castVoteRecords from './castVoteRecords';

export const batchCsvData = batchResultsCsvAsText();
export const finalCsvData = finalResultsCsvAsText();

export { election, electionDefinition } from './election.json';

export const singlePrecinctElection: Election = {
  ...election,
  precincts: [election.precincts[0]],
  ballotStyles: election.ballotStyles.map((ballotStyle) => ({
    ...ballotStyle,
    precincts: [election.precincts[0].id],
  })),
};
export const singlePrecinctElectionDefinition = asElectionDefinition(
  singlePrecinctElection
);

export * as systemSettings from '../systemSettings.json';

// To regenerate the cast vote records:
// 1. rm -rf data/electionTwoPartyPrimary/castVoteRecords/generated
// 2. cd libs/cvr-fixture-generator
// 3. ./bin/generate
//    --election-definition ../fixtures/data/electionTwoPartyPrimary/election.json
//    --output-path ../fixtures/data/electionTwoPartyPrimary/castVoteRecords/generated
export const castVoteRecordExport = {
  asDirectoryPath: () =>
    path.join(castVoteRecords.asDirectoryPath(), 'generated'),
} as const;
