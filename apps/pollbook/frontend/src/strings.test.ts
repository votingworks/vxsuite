import { test, expect } from 'vitest';
import {
  CheckInBallotParty,
  PartyAbbreviation,
} from '@votingworks/pollbook-backend';
import { partyAbbreviationToString } from './strings';

const cases: Array<{
  abbreviation: PartyAbbreviation | CheckInBallotParty;
  str: string;
}> = [
  { abbreviation: 'DEM', str: 'Democratic' },
  { abbreviation: 'REP', str: 'Republican' },
  { abbreviation: 'UND', str: 'Undeclared' },
  { abbreviation: 'NOT_APPLICABLE', str: 'Not Applicable' },
];

test.each(cases)(
  '$abbreviation stringifies to $str',
  ({ abbreviation, str }) => {
    expect(partyAbbreviationToString(abbreviation)).toEqual(str);
  }
);
