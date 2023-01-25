import { asText as standardCvrAsText } from './cvrFiles/standard.jsonl';

export * as cvrFile from './cvrFiles/standard.jsonl';
export const cvrData = standardCvrAsText();

export { election, electionDefinition } from './election.json';
