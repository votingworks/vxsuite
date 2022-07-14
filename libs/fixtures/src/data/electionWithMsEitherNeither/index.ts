import { asText as standardCvrsAsText } from './cvrFiles/standard.jsonl';
import { asText as testCvrsAsText } from './cvrFiles/test.jsonl';
import { asText as semsDataAsText } from './semsFiles/standard.csv';

export const cvrData = standardCvrsAsText();
export const cvrTestData = testCvrsAsText();
export const semsData = semsDataAsText();

export {
  election,
  electionDefinition,
} from './electionWithMsEitherNeither.json';
