import { safeParseElectionDefinition } from '@votingworks/types';
import { join } from 'path';
import { readFileSync } from 'fs';
import { Fixture } from '../../fixtures';

export const electionDefinition = safeParseElectionDefinition(
  readFileSync(join(__dirname, 'election.json'), 'utf-8')
).unsafeUnwrap();
export const { election } = electionDefinition;
export const blankPage1 = new Fixture(join(__dirname, 'blank-p1.png'));
export const blankPage2 = new Fixture(join(__dirname, 'blank-p2.png'));
export const filledInPage1 = new Fixture(join(__dirname, 'filled-in-p1.png'));
export const filledInPage2 = new Fixture(join(__dirname, 'filled-in-p2.png'));
