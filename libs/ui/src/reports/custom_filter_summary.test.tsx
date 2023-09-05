import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import { render, screen } from '../../test/react_testing_library';
import { CustomFilterSummary } from './custom_filter_summary';

test('precinct filter', () => {
  const { electionDefinition } = electionFamousNames2021Fixtures;
  render(
    <CustomFilterSummary
      electionDefinition={electionDefinition}
      filter={{ precinctIds: ['23'] }}
    />
  );
  expect(screen.getByTestId('custom-filter-summary').textContent).toEqual(
    'Precinct: North Lincoln'
  );
});

test('ballot style filter', () => {
  const { electionDefinition } = electionFamousNames2021Fixtures;
  render(
    <CustomFilterSummary
      electionDefinition={electionDefinition}
      filter={{ ballotStyleIds: ['1'] }}
    />
  );
  expect(screen.getByTestId('custom-filter-summary').textContent).toEqual(
    'Ballot Style: 1'
  );
});

test('voting method filter', () => {
  const { electionDefinition } = electionFamousNames2021Fixtures;
  render(
    <CustomFilterSummary
      electionDefinition={electionDefinition}
      filter={{ votingMethods: ['absentee'] }}
    />
  );
  expect(screen.getByTestId('custom-filter-summary').textContent).toEqual(
    'Voting Method: Absentee'
  );
});

test('complex filter', () => {
  const { electionDefinition } = electionFamousNames2021Fixtures;
  render(
    <CustomFilterSummary
      electionDefinition={electionDefinition}
      filter={{
        precinctIds: ['23'],
        ballotStyleIds: ['1'],
        votingMethods: ['absentee'],
      }}
    />
  );
  expect(screen.getByTestId('custom-filter-summary').textContent).toEqual(
    [
      'Voting Method: Absentee',
      'Precinct: North Lincoln',
      'Ballot Style: 1',
    ].join('')
  );
});
