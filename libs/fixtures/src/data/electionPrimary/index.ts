import { asText as standardCvrsAsText } from './cvrFiles/standard.txt';

export * as cvrFile from './cvrFiles/standard.txt';

export const cvrData = standardCvrsAsText();

export { election, electionDefinition } from './electionPrimarySample.json';
