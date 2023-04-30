import { asText as standardCvrsAsText } from './legacy-cvr-files/standard.jsonl';
import { asText as standardLiveCvrsAsText } from './legacy-cvr-files/standard.live.jsonl';
import { asText as batchResultsCsvAsText } from './csvFiles/batchResults.csv';
import { asText as finalResultsCsvAsText } from './csvFiles/finalResults.csv';

export * as legacyStandardCvrFile from './legacy-cvr-files/standard.jsonl';
export * as legacyStandardLiveCvrFile from './legacy-cvr-files/standard.live.jsonl';
export * as legacyPartial1CvrFile from './legacy-cvr-files/partial1.jsonl';
export * as legacyPartial2CvrFile from './legacy-cvr-files/partial2.jsonl';
export * as castVoteRecordReport from './cvr-files/standard';

export const legacyCvrData = standardCvrsAsText();
export const legacyLiveCvrsData = standardLiveCvrsAsText();
export const batchCsvData = batchResultsCsvAsText();
export const finalCsvData = finalResultsCsvAsText();

export {
  election,
  electionDefinition,
} from './electionMinimalExhaustiveSample.json';
export * as systemSettings from '../sampleAdminInitialSetupPackage/systemSettings.json';
