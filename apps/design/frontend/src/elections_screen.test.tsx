import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { useState } from 'react';
import { ok } from '@votingworks/basics';
import userEvent from '@testing-library/user-event';
import { createMemoryHistory } from 'history';
import { ElectionIdSchema, unsafeParse } from '@votingworks/types';
import { ElectionListing } from '@votingworks/design-backend';
import { format } from '@votingworks/utils';
import {
  MockApiClient,
  createMockApiClient,
  jurisdiction,
  jurisdiction2,
  provideApi,
  user,
  supportUser,
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
  apiMock.listElections.expectCallWith().resolves([]);
  const { history } = renderScreen();
  await screen.findByRole('heading', { name: 'Elections' });

  const electionRecord = blankElectionRecord(jurisdiction.id);
  apiMock.createElection
    .expectCallWith({
      jurisdictionId: jurisdiction.id,
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
  await waitFor(() => {
    expect(history.location.pathname).toEqual(`/elections/${ELECTION_ID}`);
  });
});

test('with no elections, loading an election', async () => {
  const electionRecord = primaryElectionRecord(jurisdiction.id);
  apiMock.getUser.expectCallWith().resolves(user);
  apiMock.listElections.expectCallWith().resolves([]);
  apiMock.listJurisdictions.expectCallWith().resolves([jurisdiction]);
  const { history } = renderScreen();
  await screen.findByRole('heading', { name: 'Elections' });

  userEvent.click(screen.getByRole('button', { name: 'Load Election' }));
  const modal = await screen.findByRole('alertdialog');
  const loadElectionInput = within(modal).getByLabelText(
    'Select Election File…'
  );
  const electionData = JSON.stringify(electionRecord.election);
  const file = new File([electionData], 'election.json', {
    type: 'application/json',
  });
  // JSDOM's File doesn't implement File.text
  file.text = () => Promise.resolve(electionData);
  userEvent.upload(loadElectionInput, file);

  apiMock.loadElection
    .expectCallWith({
      jurisdictionId: jurisdiction.id,
      newId: ELECTION_ID,
      upload: {
        format: 'vxf',
        electionFileContents: electionData,
      },
    })
    .resolves(ok(electionRecord.election.id));
  apiMock.listElections
    .expectCallWith()
    .resolves([electionListing(electionRecord)]);
  userEvent.click(screen.getByRole('button', { name: 'Load Election' }));

  await waitFor(() => {
    expect(history.location.pathname).toEqual(
      `/elections/${electionRecord.election.id}`
    );
  });
});

test('support user, with elections', async () => {
  const [general, primary] = [
    generalElectionRecord(jurisdiction.id),
    primaryElectionRecord(jurisdiction.id),
  ];
  apiMock.getUser.expectCallWith().resolves(supportUser);
  apiMock.listElections
    .expectCallWith()
    .resolves([electionListing(general), electionListing(primary)]);
  const { history } = renderScreen();
  await screen.findByRole('heading', { name: 'Elections' });

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
      getCloneButtonText(electionListing(general)),
    ],
    [
      'In progress',
      'jurisdiction1 Name',
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

test('support user, sort elections by status and jurisdiction', async () => {
  // Create elections with different statuses and jurisdictions
  const generalElection = generalElectionRecord(jurisdiction.id);
  const primaryElection = primaryElectionRecord(jurisdiction.id);
  const blankElection = blankElectionRecord(jurisdiction.id);

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

test('clone buttons are rendered', async () => {
  const [general, primary] = [
    generalElectionRecord(jurisdiction.id),
    primaryElectionRecord(jurisdiction.id),
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

test('single jurisdiction elections list', async () => {
  const [general, primary] = [
    generalElectionRecord(jurisdiction.id),
    primaryElectionRecord(jurisdiction.id),
  ];
  apiMock.getUser.expectCallWith().resolves(user);
  apiMock.listElections
    .expectCallWith()
    .resolves([electionListing(general), electionListing(primary)]);

  renderScreen();
  await screen.findByRole('heading', { name: 'Elections' });

  const table = screen.getByRole('table');

  // Verify the single jurisdiction table headers (no Status or Jurisdiction columns)
  const headers = within(table).getAllByRole('columnheader');
  expect(headers.map((header) => header.textContent)).toEqual([
    'Title',
    'Date',
    '', // Clone button column
  ]);

  // Verify elections are displayed correctly
  const rows = within(table).getAllByRole('row').slice(1);
  expect(rows).toHaveLength(2);

  // Check first election row content
  const firstRowCells = within(rows[0]).getAllByRole('cell');
  expect(firstRowCells[0]).toHaveTextContent(general.election.title);
  expect(firstRowCells[1]).toHaveTextContent('Nov 3, 2020');

  // Check second election row content
  const secondRowCells = within(rows[1]).getAllByRole('cell');
  expect(secondRowCells[0]).toHaveTextContent(primary.election.title);
  expect(secondRowCells[1]).toHaveTextContent('Sep 8, 2021');
});

test('elections list for user with multiple jurisdictions', async () => {
  const generalJurisdiction1 = generalElectionRecord(jurisdiction.id);
  const generalJurisdiction2 = blankElectionRecord(jurisdiction2.id);
  apiMock.getUser.expectCallWith().resolves(user);
  apiMock.listElections
    .expectCallWith()
    .resolves([
      electionListing(generalJurisdiction1),
      electionListing(generalJurisdiction2),
    ]);

  renderScreen();
  await screen.findByRole('heading', { name: 'Elections' });

  const table = screen.getByRole('table');

  const headers = within(table).getAllByRole('columnheader');
  expect(headers.map((header) => header.textContent)).toEqual([
    'Title',
    'Date',
    'Jurisdiction',
    '', // Clone button column
  ]);

  const rows = within(table).getAllByRole('row').slice(1);
  expect(rows).toHaveLength(2);

  const firstRowCells = within(rows[0]).getAllByRole('cell');
  expect(firstRowCells[2]).toHaveTextContent('jurisdiction1 Name');
  const secondRowCells = within(rows[1]).getAllByRole('cell');
  expect(secondRowCells[0]).toHaveTextContent('Untitled Election');
  expect(secondRowCells[1]).toHaveTextContent(
    format.localeDate(
      generalJurisdiction2.election.date.toMidnightDatetimeWithSystemTimezone()
    )
  );
  expect(secondRowCells[2]).toHaveTextContent('jurisdiction2 Name');

  // Can filter by jurisdiction name
  const filterInput = screen.getByLabelText(/filter elections/i);
  userEvent.type(filterInput, 'jurisdiction2 Name');

  const filteredRows = within(table).getAllByRole('row').slice(1);
  expect(filteredRows).toHaveLength(1);
  const filteredRowCells = within(filteredRows[0]).getAllByRole('cell');
  expect(filteredRowCells[2]).toHaveTextContent('jurisdiction2 Name');
});
