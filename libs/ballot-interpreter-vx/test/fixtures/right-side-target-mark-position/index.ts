import { electionMinimalExhaustiveSampleRightSideTargetsDefinition } from '@votingworks/fixtures';
import { join } from 'path';
import { Fixture } from '../../fixtures';

export const electionDefinition =
  electionMinimalExhaustiveSampleRightSideTargetsDefinition;
export const { election } = electionDefinition;
export const blankPage1 = new Fixture(join(__dirname, 'ballot-p1.jpeg'));
export const blankPage2 = new Fixture(join(__dirname, 'ballot-p2.jpeg'));
export const filledInPage1 = new Fixture(join(__dirname, 'filled-in-p1.jpeg'));
export const filledInPage2 = new Fixture(join(__dirname, 'filled-in-p2.jpeg'));
