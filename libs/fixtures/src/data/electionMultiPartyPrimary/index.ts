import { asText as standardCvrAsText } from './cvrFiles/standard.jsonl';
import { asText as batchResultsCsvAsText } from './csvFiles/batchResults.csv';
import { asText as semsDataAsText } from './semsFiles/standard.csv';

export * as cvrFile from './cvrFiles/standard.jsonl';

export const cvrData = standardCvrAsText();
export const csvData = batchResultsCsvAsText();
export const semsData = semsDataAsText();

export {
  election,
  electionDefinition,
} from './electionMultiPartyPrimarySample.json';
