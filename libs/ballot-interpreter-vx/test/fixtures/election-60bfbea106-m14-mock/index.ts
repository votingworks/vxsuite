import { safeParseElectionDefinition } from '@votingworks/types';
import { readFileSync } from 'fs';
import { join } from 'path';
import { Fixture } from '../../fixtures';

export const electionDefinition = safeParseElectionDefinition(
  readFileSync(join(__dirname, 'election.json'), 'utf-8')
).unsafeUnwrap();
export const { election } = electionDefinition;

export const page1 = new Fixture(join(__dirname, 'page-1.jpg'));
export const page2 = new Fixture(join(__dirname, 'page-2.jpg'));

export const templatePage1 = new Fixture(join(__dirname, 'template-p1.jpg'));
export const templatePage2 = new Fixture(join(__dirname, 'template-p2.jpg'));
