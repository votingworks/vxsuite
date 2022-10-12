import React from 'react';
import { ContestId, Election } from '@votingworks/types';
import { electionSample2Fixtures } from '@votingworks/fixtures';
import { render, screen, within } from '@testing-library/react';

import { ContestWriteInTally } from './contest_writein_tally';

let election: Election;
let writeInCounts: Map<ContestId, Map<string, number>>;

beforeEach(() => {
  election = electionSample2Fixtures.electionDefinition.election;
  writeInCounts = new Map([
    [
      'president',
      new Map([
        ['Foo', 12],
        ['Bar', 7],
        ['Baz', 4],
      ]),
    ],
    [
      'senator',
      new Map([
        ['Alice', 14],
        ['Bob', 8],
        ['Charlie', 4],
      ]),
    ],
    ['representative-district-18', new Map([])],
  ]);
});

it('renders correctly', () => {
  render(
    <ContestWriteInTally election={election} writeInCounts={writeInCounts} />
  );

  within(screen.getByText('Foo').closest('div')!).getByText('President');
  within(screen.getByText('Foo').closest('tr')!).getByText('12');
  within(screen.getByText('Bar').closest('tr')!).getByText('7');
  within(screen.getByText('Baz').closest('tr')!).getByText('4');

  within(screen.getByText('Alice').closest('div')!).getByText('Senator');
  within(screen.getByText('Alice').closest('tr')!).getByText('14');
  within(screen.getByText('Bob').closest('tr')!).getByText('8');
  within(screen.getByText('Charlie').closest('tr')!).getByText('4');

  expect(
    screen.queryByText('Representative, District 18')
  ).not.toBeInTheDocument();
});
