import { safeParseElectionDefinition } from '@votingworks/types';
import { readFileSync } from 'fs';
import { join } from 'path';

export const electionDefinition = safeParseElectionDefinition(
  readFileSync(join(__dirname, 'election.json'), 'utf-8')
).unsafeUnwrap();
export const { election } = electionDefinition;

// a bmd ballot
export const page1 = join(__dirname, 'page-1.jpg');
export const page2 = join(__dirname, 'page-2.jpg');
