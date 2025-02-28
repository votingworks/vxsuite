import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { ok } from '@votingworks/basics';
import userEvent from '@testing-library/user-event';
import { createMemoryHistory } from 'history';
import { ElectionId, ElectionIdSchema, unsafeParse } from '@votingworks/types';
import {
  MockApiClient,
  createMockApiClient,
  provideApi,
  vxUser,
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

let apiMock: MockApiClient;

beforeEach(() => {
  apiMock = createMockApiClient();
});

afterEach(() => {
  apiMock.assertComplete();
});

function renderScreen(electionId?: ElectionId) {
  const history = createMemoryHistory();
  const result = render(
    provideApi(
      apiMock,
      withRoute(<ElectionsScreen />, {
        paramPath: routes.root.path,
        path: routes.root.path,
        history,
      }),
      electionId
    )
  );
  return {
    ...result,
    history,
  };
}

test('with no elections, creating a new election', async () => {
  apiMock.getUser.expectCallWith().resolves(vxUser);
  apiMock.getAllOrgs.expectCallWith().resolves([
    {
      id: vxUser.orgId,
      name: 'VotingWorks',
      displayName: 'VotingWorks',
    },
  ]);
  apiMock.listElections.expectCallWith({ user: vxUser }).resolves([]);
  const { history } = renderScreen();
  await screen.findByRole('heading', { name: 'Elections' });

  const electionRecord = blankElectionRecord(vxUser.orgId);
  apiMock.createElection
    .expectCallWith({
      user: vxUser,
      orgId: vxUser.orgId,
      id: ELECTION_ID,
    })
    .resolves(ok(ELECTION_ID));
  apiMock.listElections
    .expectCallWith({ user: vxUser })
    .resolves([electionRecord]);
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
  const electionRecord = primaryElectionRecord(vxUser.orgId);
  apiMock.getUser.expectCallWith().resolves(vxUser);
  apiMock.getAllOrgs.expectCallWith().resolves([
    {
      id: vxUser.orgId,
      name: 'VotingWorks',
      displayName: 'VotingWorks',
    },
  ]);
  apiMock.listElections.expectCallWith({ user: vxUser }).resolves([]);
  const { history } = renderScreen();
  await screen.findByRole('heading', { name: 'Elections' });

  const electionData = JSON.stringify(electionRecord.election);
  apiMock.loadElection
    .expectCallWith({
      user: vxUser,
      orgId: vxUser.orgId,
      electionData,
      newId: ELECTION_ID,
    })
    .resolves(ok(electionRecord.election.id));
  apiMock.listElections
    .expectCallWith({ user: vxUser })
    .resolves([electionRecord]);
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
    generalElectionRecord(vxUser.orgId),
    primaryElectionRecord(vxUser.orgId),
  ];
  apiMock.getUser.expectCallWith().resolves(vxUser);
  apiMock.getAllOrgs.expectCallWith().resolves([
    {
      id: vxUser.orgId,
      name: 'VotingWorks',
      displayName: 'VotingWorks',
    },
  ]);
  apiMock.listElections
    .expectCallWith({ user: vxUser })
    .resolves([general, primary]);
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
    ],
    [
      'In progress',
      'VotingWorks',
      primary.election.county.name,
      primary.election.title,
      'Sep 8, 2021',
    ],
  ]);

  userEvent.click(rows[0]);
  await waitFor(() => {
    expect(history.location.pathname).toEqual(
      `/elections/${general.election.id}`
    );
  });
});
