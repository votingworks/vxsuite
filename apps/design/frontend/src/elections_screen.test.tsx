import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { ok } from '@votingworks/basics';
import userEvent from '@testing-library/user-event';
import { createMemoryHistory } from 'history';
import { Election, ElectionIdSchema, unsafeParse } from '@votingworks/types';
import {
  MockApiClient,
  createMockApiClient,
  mockUserFeatures,
  provideApi,
  user,
} from '../test/api_helpers';
import {
  blankElectionRecord,
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
function getCloneButtonText(election: Election) {
  return `[clone button] ${election.id}`;
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
  displayName: 'VotingWorks',
} as const;

let apiMock: MockApiClient;

beforeEach(() => {
  apiMock = createMockApiClient();
  mockUserFeatures(apiMock, user);
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
  apiMock.listElections.expectCallWith({ user }).resolves([]);
  const { history } = renderScreen();
  await screen.findByRole('heading', { name: 'Elections' });

  const electionRecord = blankElectionRecord(user.orgId);
  apiMock.createElection
    .expectCallWith({
      user,
      orgId: user.orgId,
      id: ELECTION_ID,
    })
    .resolves(ok(ELECTION_ID));
  apiMock.listElections.expectCallWith({ user }).resolves([electionRecord]);
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
  apiMock.getAllOrgs.expectCallWith().resolves([VX_ORG]);
  apiMock.listElections.expectCallWith({ user }).resolves([]);
  const { history } = renderScreen();
  await screen.findByRole('heading', { name: 'Elections' });

  const electionData = JSON.stringify(electionRecord.election);
  apiMock.loadElection
    .expectCallWith({
      user,
      orgId: user.orgId,
      electionData,
      newId: ELECTION_ID,
    })
    .resolves(ok(electionRecord.election.id));
  apiMock.listElections.expectCallWith({ user }).resolves([electionRecord]);
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
  apiMock.getAllOrgs.expectCallWith().resolves([VX_ORG]);
  apiMock.listElections.expectCallWith({ user }).resolves([general, primary]);
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
      'VotingWorks',
      general.election.county.name,
      general.election.title,
      'Nov 3, 2020',
      getCloneButtonText(general.election),
    ],
    [
      'In progress',
      'VotingWorks',
      primary.election.county.name,
      primary.election.title,
      'Sep 8, 2021',
      getCloneButtonText(primary.election),
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
    mockUserFeatures(apiMock, user, { CREATE_ELECTION: true });
    const [general, primary] = [
      generalElectionRecord(user.orgId),
      primaryElectionRecord(user.orgId),
    ];
    apiMock.getUser.expectCallWith().resolves(user);
    apiMock.getAllOrgs.expectCallWith().resolves([VX_ORG]);
    apiMock.listElections.expectCallWith({ user }).resolves([general, primary]);

    renderScreen();
    await screen.findByRole('heading', { name: 'Elections' });
    expect(
      screen
        .getAllByTestId(TEST_ID_CLONE_ELECTION_BUTTON)
        .map((btn) => btn.textContent)
    ).toEqual([
      getCloneButtonText(general.election),
      getCloneButtonText(primary.election),
    ]);
  });

  test('not rendered when CREATE_ELECTION feature disabled', async () => {
    mockUserFeatures(apiMock, user, {
      CREATE_ELECTION: false,
      ACCESS_ALL_ORGS: false,
    });
    const [general, primary] = [
      generalElectionRecord(user.orgId),
      primaryElectionRecord(user.orgId),
    ];
    apiMock.getUser.expectCallWith().resolves(user);
    apiMock.listElections.expectCallWith({ user }).resolves([general, primary]);

    renderScreen();
    await screen.findByRole('heading', { name: 'Elections' });
    expect(
      screen.queryByTestId(TEST_ID_CLONE_ELECTION_BUTTON)
    ).not.toBeInTheDocument();
  });
});
