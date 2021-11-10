import { parseElection } from '@votingworks/types';
import { join } from 'path';
import { Fixture } from '../../fixtures';
import electionJson from './election.json';

export const election = parseElection(electionJson);
export const ballotPdf = new Fixture(join(__dirname, 'ballot.pdf'));
export const blankPage1 = new Fixture(join(__dirname, 'blank-p1.png'));
export const blankPage2 = new Fixture(join(__dirname, 'blank-p2.png'));
export const absenteePage1 = new Fixture(join(__dirname, 'absentee-p1.png'));
export const absenteePage2 = new Fixture(join(__dirname, 'absentee-p2.png'));
