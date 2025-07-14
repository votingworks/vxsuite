import { test, expect } from 'vitest';
import { PartyAbbreviation } from '@votingworks/pollbook-backend';
import { partyAbbreviationToString } from './strings';

const cases: Array<{ abbreviation: PartyAbbreviation; str: string }> = [
  { abbreviation: 'DEM', str: 'Democratic' },
  { abbreviation: 'REP', str: 'Republican' },
  { abbreviation: 'UND', str: 'Undeclared' },
];

test.each(cases)(
  '$abbreviation stringifies to $str',
  ({ abbreviation, str }) => {
    expect(partyAbbreviationToString(abbreviation)).toEqual(str);
  }
);
