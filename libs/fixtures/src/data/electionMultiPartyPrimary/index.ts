import { asText as batchResultsCsvAsText } from './csvFiles/batchResults.csv';
import { asText as semsDataAsText } from './semsFiles/standard.csv';

export const csvData = batchResultsCsvAsText();
export const semsData = semsDataAsText();

export {
  election,
  electionDefinition,
} from './electionMultiPartyPrimarySample.json';
