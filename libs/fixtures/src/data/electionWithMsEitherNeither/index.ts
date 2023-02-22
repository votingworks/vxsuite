import { asText as standardCvrsAsText } from './cvrFiles/standard.jsonl';
import { asText as testCvrsAsText } from './cvrFiles/test.jsonl';

export const cvrData = standardCvrsAsText();
export const cvrTestData = testCvrsAsText();

export {
  election,
  electionDefinition,
} from './electionWithMsEitherNeither.json';
