import { safeParseElectionDefinition } from '@votingworks/types';
import { readFileSync } from 'fs';
import { join } from 'path';

const electionJson = readFileSync(join(__dirname, 'election.json'), 'utf8');
export const electionDefinition =
  safeParseElectionDefinition(electionJson).unsafeUnwrap();
export const { election } = electionDefinition;
