import { test, beforeEach, afterEach, expect } from 'vitest';
import userEvent from '@testing-library/user-event';
import type { ElectionListing } from '@votingworks/design-backend';
import { createMemoryHistory } from 'history';
import { useState } from 'react';
import {
  render,
  screen,
  waitFor,
  within,
} from '../../test/react_testing_library';
import {
  MockApiClient,
  createMockApiClient,
  provideApi,
  jurisdiction,
  supportUser,
} from '../../test/api_helpers';
import {
  generalElectionRecord,
  primaryElectionRecord,
  electionListing,
  blankElectionRecord,
} from '../../test/fixtures';
import { withRoute } from '../../test/routing_helpers';
import { routes } from '../routes';
import { SupportHomeScreen } from './support_home_screen';

let apiMock: MockApiClient;

beforeEach(() => {
  apiMock = createMockApiClient();
});

afterEach(() => {
  apiMock.assertComplete();
});

function Wrapper() {
  const [filterText, setFilterText] = useState('');
  return (
    <SupportHomeScreen filterText={filterText} setFilterText={setFilterText} />
  );
}

function renderScreen() {
  const history = createMemoryHistory();
  const result = render(
    provideApi(
      apiMock,
      withRoute(<Wrapper />, {
        paramPath: routes.root.path,
        path: routes.root.path,
        history,
      })
    )
  );
  return {
    ...result,
    history,
  };
}

test('lists elections', async () => {
  const [general, primary] = [
    generalElectionRecord(jurisdiction.id),
    primaryElectionRecord(jurisdiction.id),
  ];
  apiMock.getUser.expectCallWith().resolves(supportUser);
  apiMock.listElections
    .expectCallWith()
    .resolves([electionListing(general), electionListing(primary)]);
  const { history } = renderScreen();
  await screen.findByRole('heading', { name: 'Support Tools' });

  const table = screen.getByRole('table');
  const headers = within(table).getAllByRole('columnheader');
  expect(headers.map((header) => header.textContent)).toEqual([
    'Status',
    'Jurisdiction',
    'Title',
    'Date',
    '', // Clone button column
  ]);
  let rows = within(table).getAllByRole('row').slice(1);
  expect(
    rows.map((row) =>
      within(row)
        .getAllByRole('cell')
        .map((cell) => cell.textContent?.trim())
    )
  ).toEqual([
    [
      'In progress',
      'jurisdiction1 Name',
      general.election.title,
      'Nov 3, 2020',
      `Make a copy of ${general.election.title}`,
    ],
    [
      'In progress',
      'jurisdiction1 Name',
      primary.election.title,
      'Sep 8, 2021',
      `Make a copy of ${primary.election.title}`,
    ],
  ]);

  // Test filter
  const filterInput = screen.getByLabelText(/filter elections/i);
  expect(filterInput).toHaveFocus();

  // Search for general election title
  userEvent.type(filterInput, general.election.title);

  let filteredRows = within(table).getAllByRole('row').slice(1);
  expect(filteredRows).toHaveLength(1);
  expect(
    within(filteredRows[0]).getByText(general.election.title)
  ).toBeInTheDocument();

  // Search for non-existent jurisdiction
  userEvent.clear(filterInput);
  userEvent.type(filterInput, 'jurisdiction0');
  filteredRows = within(table).getAllByRole('row').slice(1);
  expect(filteredRows).toHaveLength(0);

  // Clear search to show all rows again
  userEvent.click(
    within(filterInput.parentElement!).getByRole('button', { name: /Clear/ })
  );
  expect(filterInput).toHaveFocus();

  rows = within(table).getAllByRole('row').slice(1);
  expect(rows).toHaveLength(2);
  expect(within(rows[0]).getByText(general.election.title)).toBeInTheDocument();
  expect(within(rows[1]).getByText(primary.election.title)).toBeInTheDocument();

  userEvent.click(within(rows[0]).getAllByRole('cell')[0]);
  await waitFor(() => {
    expect(history.location.pathname).toEqual(
      `/elections/${general.election.id}`
    );
  });
});

test('sort elections by status and jurisdiction', async () => {
  // Create elections with different statuses and jurisdictions
  const generalElection = generalElectionRecord(jurisdiction.id);
  const primaryElection = primaryElectionRecord(jurisdiction.id);
  const blankElection = blankElectionRecord(jurisdiction);

  const elections: ElectionListing[] = [
    // Election with inProgress status
    {
      ...electionListing(primaryElection),
      status: 'inProgress' as const,
      jurisdictionName: 'Alpha Jurisdiction',
      jurisdictionId: 'County B',
    },
    // Election with ballotsFinalized status
    {
      ...electionListing(generalElection),
      status: 'ballotsFinalized' as const,
      jurisdictionName: 'VotingWorks',
      jurisdictionId: 'County A',
    },
    // Election with notStarted status
    {
      ...electionListing(blankElection),
      status: 'notStarted' as const,
      jurisdictionName: 'Zeta Jurisdiction',
      jurisdictionId: 'County C',
    },
  ];

  apiMock.getUser.expectCallWith().resolves(supportUser);
  apiMock.listElections.expectCallWith().resolves(elections);

  renderScreen();
  await screen.findByRole('heading', { name: 'Support Tools' });

  const table = screen.getByRole('table');

  // Test initial order (unsorted)
  let rows = within(table).getAllByRole('row').slice(1);
  expect(rows).toHaveLength(3);
  expect(within(rows[0]).getAllByRole('cell')[0]).toHaveTextContent(
    'In progress'
  );
  expect(within(rows[1]).getAllByRole('cell')[0]).toHaveTextContent(
    'Ballots finalized'
  );
  expect(within(rows[2]).getAllByRole('cell')[0]).toHaveTextContent(
    'Not started'
  );

  // Test sorting by Status (ascending)
  const statusHeader = within(table).getByRole('button', { name: /status/i });
  userEvent.click(statusHeader);

  rows = within(table).getAllByRole('row').slice(1);
  // ballotsFinalized, inProgress, notStarted (alphabetical order)
  expect(within(rows[0]).getAllByRole('cell')[0]).toHaveTextContent(
    'Ballots finalized'
  );
  expect(within(rows[1]).getAllByRole('cell')[0]).toHaveTextContent(
    'In progress'
  );
  expect(within(rows[2]).getAllByRole('cell')[0]).toHaveTextContent(
    'Not started'
  );

  // Test sorting by Status (descending)
  userEvent.click(statusHeader);

  rows = within(table).getAllByRole('row').slice(1);
  // Reverse order
  expect(within(rows[0]).getAllByRole('cell')[0]).toHaveTextContent(
    'Not started'
  );
  expect(within(rows[1]).getAllByRole('cell')[0]).toHaveTextContent(
    'In progress'
  );
  expect(within(rows[2]).getAllByRole('cell')[0]).toHaveTextContent(
    'Ballots finalized'
  );

  // Test sorting by Status (third click - unsorted, back to original order)
  userEvent.click(statusHeader);

  rows = within(table).getAllByRole('row').slice(1);
  // Back to original order
  expect(within(rows[0]).getAllByRole('cell')[0]).toHaveTextContent(
    'In progress'
  );
  expect(within(rows[1]).getAllByRole('cell')[0]).toHaveTextContent(
    'Ballots finalized'
  );
  expect(within(rows[2]).getAllByRole('cell')[0]).toHaveTextContent(
    'Not started'
  );

  // Test sorting by Jurisdiction (ascending)
  const jurisdictionHeader = within(table).getByRole('button', {
    name: /jurisdiction/i,
  });
  userEvent.click(jurisdictionHeader);

  rows = within(table).getAllByRole('row').slice(1);
  // Alpha Jurisdiction, VotingWorks, Zeta Jurisdiction (alphabetical)
  expect(within(rows[0]).getAllByRole('cell')[1]).toHaveTextContent(
    'Alpha Jurisdiction'
  );
  expect(within(rows[1]).getAllByRole('cell')[1]).toHaveTextContent(
    'VotingWorks'
  );
  expect(within(rows[2]).getAllByRole('cell')[1]).toHaveTextContent(
    'Zeta Jurisdiction'
  );

  // Test sorting by Jurisdiction (descending)
  userEvent.click(jurisdictionHeader);
  rows = within(table).getAllByRole('row').slice(1);
  // Reverse alphabetical order
  expect(within(rows[0]).getAllByRole('cell')[1]).toHaveTextContent(
    'Zeta Jurisdiction'
  );
  expect(within(rows[1]).getAllByRole('cell')[1]).toHaveTextContent(
    'VotingWorks'
  );
  expect(within(rows[2]).getAllByRole('cell')[1]).toHaveTextContent(
    'Alpha Jurisdiction'
  );

  // Test sorting by Jurisdiction (third click - unsorted, back to original order)
  userEvent.click(jurisdictionHeader);
  rows = within(table).getAllByRole('row').slice(1);
  // Back to original order
  expect(within(rows[0]).getAllByRole('cell')[1]).toHaveTextContent(
    'Alpha Jurisdiction'
  );
  expect(within(rows[1]).getAllByRole('cell')[1]).toHaveTextContent(
    'VotingWorks'
  );
  expect(within(rows[2]).getAllByRole('cell')[1]).toHaveTextContent(
    'Zeta Jurisdiction'
  );
});
