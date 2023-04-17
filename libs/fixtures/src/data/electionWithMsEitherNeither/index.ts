import { asText as standardCvrsAsText } from './legacy-cvr-files/standard.jsonl';
import { asText as testCvrsAsText } from './legacy-cvr-files/test.jsonl';

export const legacyCvrData = standardCvrsAsText();
export const legacyCvrTestData = testCvrsAsText();

export {
  election,
  electionDefinition,
} from './electionWithMsEitherNeither.json';
