import { Election } from '@votingworks/types';
import { asElectionDefinition } from '../../util';
import { asText as batchResultsCsvAsText } from './csvFiles/batchResults.csv';
import { asText as finalResultsCsvAsText } from './csvFiles/finalResults.csv';
import { election } from './election.json';

export * as castVoteRecordReport from './cvr-files/standard';

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
