import { safeParseElectionDefinition } from '@votingworks/types';
import { readFileSync } from 'fs';
import { join } from 'path';

const electionJson = readFileSync(join(__dirname, 'election.json'), 'utf8');
export const electionDefinition = safeParseElectionDefinition(
  electionJson
).unsafeUnwrap();
export const { election } = electionDefinition;
export const ballotPdf = join(__dirname, 'ballot.pdf');
export const filledInPage1 = join(__dirname, 'filled-in-p1.png');
export const filledInPage2 = join(__dirname, 'filled-in-p2.png');
