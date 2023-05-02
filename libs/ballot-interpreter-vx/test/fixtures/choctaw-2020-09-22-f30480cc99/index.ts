import { safeParseElectionDefinition } from '@votingworks/types';
import { join } from 'path';
import { readFileSync } from 'fs';
import { Fixture } from '../../fixtures';

export const electionDefinition = safeParseElectionDefinition(
  readFileSync(join(__dirname, 'election.json'), 'utf-8')
).unsafeUnwrap();
export const blankPage1 = new Fixture(join(__dirname, 'blank-p1.png'));
export const hardQrCodePage1 = join(__dirname, 'hard-qr-code-p1.png');
