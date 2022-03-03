import { safeParseElectionDefinition } from '@votingworks/types';
import { join } from 'path';
import { readFileSync } from 'fs';
import { Fixture } from '../../fixtures';

export const electionDefinition = safeParseElectionDefinition(
  readFileSync(join(__dirname, 'election.json'), 'utf-8')
).unsafeUnwrap();
export const { election } = electionDefinition;
export const ballotPdf = new Fixture(join(__dirname, 'ballot.pdf'));
export const blankPage1 = new Fixture(join(__dirname, 'blank-p1.png'));
export const blankPage2 = new Fixture(join(__dirname, 'blank-p2.png'));
export const absenteePage1 = new Fixture(join(__dirname, 'absentee-p1.png'));
export const absenteePage2 = new Fixture(join(__dirname, 'absentee-p2.png'));
