import { asText as cvrDataSmall1AsText } from './legacy-cvr-files/small1.txt';
import { asText as cvrDataSmall2AsText } from './legacy-cvr-files/small2.txt';
import { asText as cvrDataSmall3AsText } from './legacy-cvr-files/small3.txt';
import { asText as cvrDataStandard1AsText } from './legacy-cvr-files/standard.txt';
import { asText as cvrDataStandard2AsText } from './legacy-cvr-files/standard2.txt';

export const legacyCvrDataSmall1 = cvrDataSmall1AsText();
export const legacyCvrDataSmall2 = cvrDataSmall2AsText();
export const legacyCvrDataSmall3 = cvrDataSmall3AsText();
export const legacyCvrDataStandard1 = cvrDataStandard1AsText();
export const legacyCvrDataStandard2 = cvrDataStandard2AsText();

export { electionDefinition, election } from './election.json';
