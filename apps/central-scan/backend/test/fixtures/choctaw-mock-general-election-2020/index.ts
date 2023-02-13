import { safeParseElectionDefinition } from '@votingworks/types';
import { BallotPackageManifest } from '@votingworks/shared';
import { readFileSync } from 'fs-extra';
import { join } from 'path';

const electionJson = readFileSync(join(__dirname, 'election.json'), 'utf8');
export const electionDefinition =
  safeParseElectionDefinition(electionJson).unsafeUnwrap();
export const { election } = electionDefinition;
export const root = __dirname;
export const manifest: BallotPackageManifest = JSON.parse(
  readFileSync(join(__dirname, 'manifest.json'), 'utf8')
);
export const ballotPdf = join(__dirname, 'ballot.pdf');
export const filledInPage1 = join(__dirname, 'filled-in-p1.jpeg');
export const filledInPage2 = join(__dirname, 'filled-in-p2.jpeg');
