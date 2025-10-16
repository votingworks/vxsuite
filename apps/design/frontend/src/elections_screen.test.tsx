import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { useState } from 'react';
import { err, ok } from '@votingworks/basics';
import userEvent from '@testing-library/user-event';
import { createMemoryHistory } from 'history';
import { ElectionIdSchema, unsafeParse } from '@votingworks/types';
import { ElectionListing } from '@votingworks/design-backend';
import {
  MockApiClient,
  createMockApiClient,
  mockUserFeatures,
  provideApi,
  user,
} from '../test/api_helpers';
import {
  blankElectionRecord,
  electionListing,
  generalElectionRecord,
  primaryElectionRecord,
} from '../test/fixtures';
import { render, screen, waitFor, within } from '../test/react_testing_library';
import { withRoute } from '../test/routing_helpers';
import { ElectionsScreen } from './elections_screen';
import { routes } from './routes';

// Pin all IDs to a known value for deterministic tests.
const ID = 'ID';
const ELECTION_ID = unsafeParse(ElectionIdSchema, ID);
vi.mock(import('./utils.js'), async (importActual) => ({
  ...(await importActual()),
  generateId: () => ID,
}));

const TEST_ID_CLONE_ELECTION_BUTTON = 'CloneElectionButton';
function getCloneButtonText(election: ElectionListing) {
  return `[clone button] ${election.electionId}`;
}
vi.mock(import('./clone_election_button.js'), async (importActual) => ({
  ...(await importActual()),
  CloneElectionButton: (props) => (
    <div data-testid={TEST_ID_CLONE_ELECTION_BUTTON}>
      {/* eslint-disable-next-line react/destructuring-assignment */}
      {getCloneButtonText(props.election)}
    </div>
  ),
}));

const VX_ORG = {
  id: user.orgId,
  name: 'VotingWorks',
} as const;

let apiMock: MockApiClient;

beforeEach(() => {
  apiMock = createMockApiClient();
  mockUserFeatures(apiMock);
});

afterEach(() => {
  apiMock.assertComplete();
});

function Wrapper() {
  const [filterText, setFilterText] = useState('');
  return (
    <ElectionsScreen filterText={filterText} setFilterText={setFilterText} />
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

test('with no elections, creating a new election', async () => {
  apiMock.getUser.expectCallWith().resolves(user);
  apiMock.listOrganizations.expectCallWith().resolves([VX_ORG]);
  apiMock.listElections.expectCallWith().resolves([]);
  const { history } = renderScreen();
  await screen.findByRole('heading', { name: 'Elections' });

  const electionRecord = blankElectionRecord(user.orgId);
  apiMock.createElection
    .expectCallWith({
      orgId: user.orgId,
      id: ELECTION_ID,
    })
    .resolves(ok(ELECTION_ID));
  apiMock.listElections
    .expectCallWith()
    .resolves([electionListing(electionRecord)]);
  const createElectionButton = screen.getByRole('button', {
    name: 'Create Election',
  });
  userEvent.click(createElectionButton);
  userEvent.type(screen.getByRole('combobox'), 'VotingWorks[Enter]');
  userEvent.click(screen.getByRole('button', { name: 'Confirm' }));
  await waitFor(() => {
    expect(history.location.pathname).toEqual(`/elections/${ELECTION_ID}`);
  });
});

test('with no elections, loading an election', async () => {
  const electionRecord = primaryElectionRecord(user.orgId);
  apiMock.getUser.expectCallWith().resolves(user);
  apiMock.listElections.expectCallWith().resolves([]);
  const { history } = renderScreen();
  await screen.findByRole('heading', { name: 'Elections' });

  const electionData = JSON.stringify(electionRecord.election);
  apiMock.loadElection
    .expectCallWith({
      orgId: user.orgId,
      electionData,
      newId: ELECTION_ID,
    })
    .resolves(ok(electionRecord.election.id));
  apiMock.listElections
    .expectCallWith()
    .resolves([electionListing(electionRecord)]);
  const loadElectionInput = screen.getByLabelText('Load Election');
  const file = new File([electionData], 'election.json', {
    type: 'application/json',
  });
  // JSDOM's File doesn't implement File.text
  file.text = () => Promise.resolve(electionData);
  userEvent.upload(loadElectionInput, file);
  await waitFor(() => {
    expect(history.location.pathname).toEqual(
      `/elections/${electionRecord.election.id}`
    );
  });
});

test('with elections', async () => {
  const [general, primary] = [
    generalElectionRecord(user.orgId),
    primaryElectionRecord(user.orgId),
  ];
  apiMock.getUser.expectCallWith().resolves(user);
  apiMock.listElections
    .expectCallWith()
    .resolves([electionListing(general), electionListing(primary)]);
  const { history } = renderScreen();
  await screen.findByRole('heading', { name: 'Elections' });

  const table = screen.getByRole('table');
  const headers = within(table).getAllByRole('columnheader');
  expect(headers.map((header) => header.textContent)).toEqual([
    'Status',
    'Org',
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
      'org1 Name',
      general.election.county.name,
      general.election.title,
      'Nov 3, 2020',
      getCloneButtonText(electionListing(general)),
    ],
    [
      'In progress',
      'org1 Name',
      primary.election.county.name,
      primary.election.title,
      'Sep 8, 2021',
      getCloneButtonText(electionListing(primary)),
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

  // Search for non-existent org
  userEvent.clear(filterInput);
  userEvent.type(filterInput, 'org0');
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

test('sorting elections by status, org, and jurisdiction', async () => {
  // Create elections with different statuses and orgs
  const generalElection = generalElectionRecord(user.orgId);
  const primaryElection = primaryElectionRecord(user.orgId);
  const blankElection = blankElectionRecord(user.orgId);

  const elections = [
    // Election with inProgress status
    {
      ...electionListing(primaryElection),
      status: 'inProgress' as const,
      orgName: 'Alpha Org',
      jurisdiction: 'County B',
    },
    // Election with ballotsFinalized status
    {
      ...electionListing(generalElection),
      status: 'ballotsFinalized' as const,
      orgName: 'VotingWorks',
      jurisdiction: 'County A',
    },
    // Election with notStarted status
    {
      ...electionListing(blankElection),
      status: 'notStarted' as const,
      orgName: 'Zeta Org',
      jurisdiction: 'County C',
    },
  ];

  apiMock.getUser.expectCallWith().resolves(user);
  apiMock.listElections.expectCallWith().resolves(elections);

  renderScreen();
  await screen.findByRole('heading', { name: 'Elections' });

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

  // Test sorting by Org (ascending)
  const orgHeader = within(table).getByRole('button', { name: /org/i });
  userEvent.click(orgHeader);

  rows = within(table).getAllByRole('row').slice(1);
  // Alpha Org, VotingWorks, Zeta Org (alphabetical)
  expect(within(rows[0]).getAllByRole('cell')[1]).toHaveTextContent(
    'Alpha Org'
  );
  expect(within(rows[1]).getAllByRole('cell')[1]).toHaveTextContent(
    'VotingWorks'
  );
  expect(within(rows[2]).getAllByRole('cell')[1]).toHaveTextContent('Zeta Org');

  // Test sorting by Org (descending)
  userEvent.click(orgHeader);
  rows = within(table).getAllByRole('row').slice(1);
  // Reverse alphabetical order
  expect(within(rows[0]).getAllByRole('cell')[1]).toHaveTextContent('Zeta Org');
  expect(within(rows[1]).getAllByRole('cell')[1]).toHaveTextContent(
    'VotingWorks'
  );
  expect(within(rows[2]).getAllByRole('cell')[1]).toHaveTextContent(
    'Alpha Org'
  );

  // Test sorting by Org (third click - unsorted, back to original order)
  userEvent.click(orgHeader);
  rows = within(table).getAllByRole('row').slice(1);
  // Back to original order
  expect(within(rows[0]).getAllByRole('cell')[1]).toHaveTextContent(
    'Alpha Org'
  );
  expect(within(rows[1]).getAllByRole('cell')[1]).toHaveTextContent(
    'VotingWorks'
  );
  expect(within(rows[2]).getAllByRole('cell')[1]).toHaveTextContent('Zeta Org');

  // Test sorting by Jurisdiction (ascending)
  const jurisdictionHeader = within(table).getByRole('button', {
    name: /jurisdiction/i,
  });
  userEvent.click(jurisdictionHeader);

  rows = within(table).getAllByRole('row').slice(1);
  // County A, County B, County C (alphabetical)
  expect(within(rows[0]).getAllByRole('cell')[2]).toHaveTextContent('County A');
  expect(within(rows[1]).getAllByRole('cell')[2]).toHaveTextContent('County B');
  expect(within(rows[2]).getAllByRole('cell')[2]).toHaveTextContent('County C');

  // Test sorting by Jurisdiction (descending)
  userEvent.click(jurisdictionHeader);

  rows = within(table).getAllByRole('row').slice(1);
  // Reverse alphabetical order
  expect(within(rows[0]).getAllByRole('cell')[2]).toHaveTextContent('County C');
  expect(within(rows[1]).getAllByRole('cell')[2]).toHaveTextContent('County B');
  expect(within(rows[2]).getAllByRole('cell')[2]).toHaveTextContent('County A');

  // Test sorting by Jurisdiction (third click - unsorted, back to original order)
  userEvent.click(jurisdictionHeader);

  rows = within(table).getAllByRole('row').slice(1);
  // Back to original order
  expect(within(rows[0]).getAllByRole('cell')[2]).toHaveTextContent('County B');
  expect(within(rows[1]).getAllByRole('cell')[2]).toHaveTextContent('County A');
  expect(within(rows[2]).getAllByRole('cell')[2]).toHaveTextContent('County C');
});

test('clone buttons are rendered', async () => {
  const [general, primary] = [
    generalElectionRecord(user.orgId),
    primaryElectionRecord(user.orgId),
  ];
  apiMock.getUser.expectCallWith().resolves(user);
  apiMock.listElections
    .expectCallWith()
    .resolves([electionListing(general), electionListing(primary)]);

  renderScreen();
  await screen.findByRole('heading', { name: 'Elections' });
  expect(
    screen
      .getAllByTestId(TEST_ID_CLONE_ELECTION_BUTTON)
      .map((btn) => btn.textContent)
  ).toEqual([
    getCloneButtonText(electionListing(general)),
    getCloneButtonText(electionListing(primary)),
  ]);
});

test('single org elections list', async () => {
  // Mock features with ACCESS_ALL_ORGS disabled
  mockUserFeatures(apiMock, { ACCESS_ALL_ORGS: false });

  const [general, primary] = [
    generalElectionRecord(user.orgId),
    primaryElectionRecord(user.orgId),
  ];
  apiMock.getUser.expectCallWith().resolves(user);
  apiMock.listElections
    .expectCallWith()
    .resolves([electionListing(general), electionListing(primary)]);

  renderScreen();
  await screen.findByRole('heading', { name: 'Elections' });

  const table = screen.getByRole('table');

  // Verify the single org table headers (no Status or Org columns)
  const headers = within(table).getAllByRole('columnheader');
  expect(headers.map((header) => header.textContent)).toEqual([
    'Title',
    'Date',
    'Jurisdiction',
    'State',
    '', // Clone button column
  ]);

  // Verify elections are displayed correctly
  const rows = within(table).getAllByRole('row').slice(1);
  expect(rows).toHaveLength(2);

  // Check first election row content
  const firstRowCells = within(rows[0]).getAllByRole('cell');
  expect(firstRowCells[0]).toHaveTextContent(general.election.title);
  expect(firstRowCells[1]).toHaveTextContent('Nov 3, 2020');
  expect(firstRowCells[2]).toHaveTextContent(general.election.county.name);
  expect(firstRowCells[3]).toHaveTextContent(general.election.state);

  // Check second election row content
  const secondRowCells = within(rows[1]).getAllByRole('cell');
  expect(secondRowCells[0]).toHaveTextContent(primary.election.title);
  expect(secondRowCells[1]).toHaveTextContent('Sep 8, 2021');
  expect(secondRowCells[2]).toHaveTextContent(primary.election.county.name);
  expect(secondRowCells[3]).toHaveTextContent(primary.election.state);
});

test('shows error message when loading election fails', async () => {
  const electionRecord = primaryElectionRecord(user.orgId);
  apiMock.getUser.expectCallWith().resolves(user);
  apiMock.listElections.expectCallWith().resolves([]);
  await screen.findByRole('heading', { name: 'Elections' });

  const electionData = JSON.stringify(electionRecord.election);
  apiMock.loadElection
    .expectCallWith({
      orgId: user.orgId,
      electionData,
      newId: ELECTION_ID,
    })
    .resolves(err(new Error('mock error details')));
  const loadElectionInput = screen.getByLabelText('Load Election');
  const file = new File([electionData], 'election.json', {
    type: 'application/json',
  });
  // JSDOM's File doesn't implement File.text
  file.text = () => Promise.resolve(electionData);
  userEvent.upload(loadElectionInput, file);
  const errorModal = await screen.findByRole('alertdialog');
  within(errorModal).getByRole('heading', { name: 'Error Loading Election' });
  within(errorModal).getByText('mock error details');
});
