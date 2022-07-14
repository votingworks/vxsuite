import { asText as standardCvrsAsText } from './cvrFiles/standard.jsonl';
import { asText as partial1CvrsAsText } from './cvrFiles/partial1.jsonl';
import { asText as partial2CvrsAsText } from './cvrFiles/partial2.jsonl';
import { asText as semsDataAsText } from './semsFiles/standard.csv';

export const cvrData = standardCvrsAsText();
export const semsData = semsDataAsText();
export const semsDataPartial1 = partial1CvrsAsText();
export const semsDataPartial2 = partial2CvrsAsText();

export {
  election,
  electionDefinition,
} from './electionMinimalExhaustiveSample.json';
