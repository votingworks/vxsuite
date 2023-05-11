import { safeParseElectionDefinition } from '@votingworks/types';
import { readFileSync } from 'fs';
import { join } from 'path';

const electionJson = readFileSync(join(__dirname, 'election.json'), 'utf8');
export const electionDefinition =
  safeParseElectionDefinition(electionJson).unsafeUnwrap();
export const { election } = electionDefinition;
export const root = __dirname;
export const ballotPdf = join(__dirname, 'ballot.pdf');
export const filledInPage1Flipped = join(
  __dirname,
  'filled-in-dual-language-p1-flipped.jpg'
);
export const filledInPage1 = join(__dirname, 'filled-in-dual-language-p1.jpg');
export const filledInPage2 = join(__dirname, 'filled-in-dual-language-p2.jpg');
export const filledInPage3 = join(__dirname, 'filled-in-dual-language-p3.jpg');
export const filledInPage4 = join(__dirname, 'filled-in-dual-language-p4.jpg');
export const filledInPage5 = join(__dirname, 'filled-in-dual-language-p5.jpg');
export const filledInPage6 = join(__dirname, 'filled-in-dual-language-p6.jpg');
