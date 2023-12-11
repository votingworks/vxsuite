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

test('scanner filter', () => {
  const { electionDefinition } = electionFamousNames2021Fixtures;
  render(
    <CustomFilterSummary
      electionDefinition={electionDefinition}
      filter={{ scannerIds: ['VX-00-000'] }}
    />
  );
  expect(screen.getByTestId('custom-filter-summary').textContent).toEqual(
    'Scanner: VX-00-000'
  );
});

test('batch filter', () => {
  const { electionDefinition } = electionFamousNames2021Fixtures;
  render(
    <CustomFilterSummary
      electionDefinition={electionDefinition}
      filter={{ batchIds: ['12345678-0000-0000-0000-000000000000'] }}
    />
  );
  expect(screen.getByTestId('custom-filter-summary').textContent).toEqual(
    'Batch: 12345678'
  );
});

test('adjudication status filter', () => {
  const { electionDefinition } = electionFamousNames2021Fixtures;

  const { unmount } = render(
    <CustomFilterSummary
      electionDefinition={electionDefinition}
      filter={{ adjudicationFlags: ['isBlank'] }}
    />
  );
  expect(screen.getByTestId('custom-filter-summary').textContent).toEqual(
    'Adjudication Status: Blank Ballot'
  );
  unmount();

  render(
    <CustomFilterSummary
      electionDefinition={electionDefinition}
      filter={{ adjudicationFlags: ['hasWriteIn', 'hasOvervote'] }}
    />
  );
  expect(screen.getByTestId('custom-filter-summary').textContent).toEqual(
    'Adjudication Statuses: Write-In, Overvote'
  );
});

test('district filter', () => {
  const { electionDefinition } = electionFamousNames2021Fixtures;
  render(
    <CustomFilterSummary
      electionDefinition={electionDefinition}
      filter={{ districtIds: ['district-1'] }}
    />
  );
  expect(screen.getByTestId('custom-filter-summary').textContent).toEqual(
    'District: City of Lincoln'
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
