import { asText as standardCvrAsText } from './legacy-cvr-files/standard.jsonl';
import { asText as batchResultsCsvAsText } from './csvFiles/batchResults.csv';
import { asText as semsDataAsText } from './semsFiles/standard.csv';

export * as legacyCvrFile from './legacy-cvr-files/standard.jsonl';

export const legacyCvrData = standardCvrAsText();
export const csvData = batchResultsCsvAsText();
export const semsData = semsDataAsText();

export {
  election,
  electionDefinition,
} from './electionMultiPartyPrimarySample.json';
