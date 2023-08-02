import { asText as batchResultsCsvAsText } from './csvFiles/batchResults.csv';
import { asText as finalResultsCsvAsText } from './csvFiles/finalResults.csv';

export * as castVoteRecordReport from './cvr-files/standard';

export const batchCsvData = batchResultsCsvAsText();
export const finalCsvData = finalResultsCsvAsText();

export {
  election,
  electionDefinition,
} from './electionMinimalExhaustiveSample.json';
export * as systemSettings from '../sampleAdminInitialSetupPackage/systemSettings.json';
