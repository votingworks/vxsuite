import { asText as cvrDataSmall1AsText } from './cvrFiles/small1.txt';
import { asText as cvrDataSmall2AsText } from './cvrFiles/small2.txt';
import { asText as cvrDataSmall3AsText } from './cvrFiles/small3.txt';
import { asText as cvrDataStandard1AsText } from './cvrFiles/standard.txt';
import { asText as cvrDataStandard2AsText } from './cvrFiles/standard2.txt';

export const cvrDataSmall1 = cvrDataSmall1AsText();
export const cvrDataSmall2 = cvrDataSmall2AsText();
export const cvrDataSmall3 = cvrDataSmall3AsText();
export const cvrDataStandard1 = cvrDataStandard1AsText();
export const cvrDataStandard2 = cvrDataStandard2AsText();

export { electionDefinition, election } from './election.json';
