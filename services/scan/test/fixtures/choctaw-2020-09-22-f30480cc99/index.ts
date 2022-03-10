import { safeParseElectionDefinition } from '@votingworks/types';
import { readFileSync } from 'fs';
import { join } from 'path';

const electionJson = readFileSync(join(__dirname, 'election.json'), 'utf8');
export const electionDefinition = safeParseElectionDefinition(
  electionJson
).unsafeUnwrap();
export const { election } = electionDefinition;
export const ballotPdf = join(__dirname, 'ballot.pdf');
export const ballot6522Pdf = join(__dirname, 'ballot-6522.pdf');
export const blankPage1 = join(__dirname, 'blank-p1.png');
export const blankPage2 = join(__dirname, 'blank-p2.png');
