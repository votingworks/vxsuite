import {
  electionFamousNames2021Fixtures,
  electionTwoPartyPrimaryFixtures,
} from '@votingworks/fixtures';
import { render, screen } from '../../test/react_testing_library';
import { CustomFilterSummary } from './custom_filter_summary';
import { mockScannerBatches } from '../../test/fixtures';

test('precinct filter', () => {
  const { electionDefinition } = electionFamousNames2021Fixtures;
  render(
    <CustomFilterSummary
      electionDefinition={electionDefinition}
      scannerBatches={mockScannerBatches}
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
      scannerBatches={mockScannerBatches}
      filter={{ ballotStyleGroupIds: ['1'] }}
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
      scannerBatches={mockScannerBatches}
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
      scannerBatches={mockScannerBatches}
      filter={{ scannerIds: ['VX-00-000'] }}
    />
  );
  expect(screen.getByTestId('custom-filter-summary').textContent).toEqual(
    'Scanner: VX-00-000'
  );
});

test('batch filter', () => {
  const { electionDefinition } = electionFamousNames2021Fixtures;
  const batch = mockScannerBatches[1];
  render(
    <CustomFilterSummary
      electionDefinition={electionDefinition}
      scannerBatches={mockScannerBatches}
      filter={{ batchIds: [batch.batchId] }}
    />
  );
  expect(screen.getByTestId('custom-filter-summary').textContent).toEqual(
    `Batch: ${batch.label}`
  );
});

test('adjudication status filter', () => {
  const { electionDefinition } = electionFamousNames2021Fixtures;

  const { unmount } = render(
    <CustomFilterSummary
      electionDefinition={electionDefinition}
      scannerBatches={mockScannerBatches}
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
      scannerBatches={mockScannerBatches}
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
      scannerBatches={mockScannerBatches}
      filter={{ districtIds: ['district-1'] }}
    />
  );
  expect(screen.getByTestId('custom-filter-summary').textContent).toEqual(
    'District: City of Lincoln'
  );
});

test('party filter', () => {
  const { electionDefinition } = electionTwoPartyPrimaryFixtures;
  const party = electionDefinition.election.parties[0]!;
  render(
    <CustomFilterSummary
      electionDefinition={electionDefinition}
      scannerBatches={mockScannerBatches}
      filter={{ partyIds: [party.id] }}
    />
  );
  expect(screen.getByTestId('custom-filter-summary').textContent).toEqual(
    `Party: ${party.fullName}`
  );
});

test('complex filter', () => {
  const { electionDefinition } = electionFamousNames2021Fixtures;
  render(
    <CustomFilterSummary
      electionDefinition={electionDefinition}
      scannerBatches={mockScannerBatches}
      filter={{
        precinctIds: ['23'],
        ballotStyleGroupIds: ['1'],
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
