import { asText as standardCvrAsText } from './legacy-cvr-files/standard.jsonl';

export * as legacyCvrFile from './legacy-cvr-files/standard.jsonl';
export const legacyCvrData = standardCvrAsText();

export { election, electionDefinition } from './election.json';
