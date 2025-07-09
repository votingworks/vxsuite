import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { ok } from '@votingworks/basics';
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

function renderScreen() {
  const history = createMemoryHistory();
  const result = render(
    provideApi(
      apiMock,
      withRoute(<ElectionsScreen />, {
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
  apiMock.getAllOrgs.expectCallWith().resolves([VX_ORG]);
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
  const rows = within(table).getAllByRole('row').slice(1);
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

  userEvent.click(within(rows[0]).getAllByRole('cell')[0]);
  await waitFor(() => {
    expect(history.location.pathname).toEqual(
      `/elections/${general.election.id}`
    );
  });
});

describe('clone buttons', () => {
  test('rendered when CREATE_ELECTION feature enabled', async () => {
    mockUserFeatures(apiMock, { CREATE_ELECTION: true });
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

  test('not rendered when CREATE_ELECTION feature disabled', async () => {
    mockUserFeatures(apiMock, {
      CREATE_ELECTION: false,
      ACCESS_ALL_ORGS: false,
    });
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
      screen.queryByTestId(TEST_ID_CLONE_ELECTION_BUTTON)
    ).not.toBeInTheDocument();
  });
});
