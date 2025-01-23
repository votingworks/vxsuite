import { afterEach, beforeEach, expect, test } from 'vitest';
import { ok } from '@votingworks/basics';
import userEvent from '@testing-library/user-event';
import { createMemoryHistory } from 'history';
import {
  MockApiClient,
  createMockApiClient,
  provideApi,
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

let apiMock: MockApiClient;

beforeEach(() => {
  apiMock = createMockApiClient();
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
  apiMock.listElections.expectCallWith().resolves([]);
  const { history } = renderScreen();
  await screen.findByRole('heading', { name: 'Elections' });
  screen.getByText("You haven't created any elections yet.");

  apiMock.createElection
    .expectCallWith({ id: blankElectionRecord.election.id })
    .resolves(ok(blankElectionRecord.election.id));
  apiMock.listElections.expectCallWith().resolves([blankElectionRecord]);
  const createElectionButton = screen.getByRole('button', {
    name: 'Create Election',
  });
  userEvent.click(createElectionButton);
  await waitFor(() => {
    expect(history.location.pathname).toEqual(
      `/elections/${blankElectionRecord.election.id}`
    );
  });
});

test('with no elections, loading an election', async () => {
  apiMock.listElections.expectCallWith().resolves([]);
  const { history } = renderScreen();
  await screen.findByRole('heading', { name: 'Elections' });

  const electionData = JSON.stringify(primaryElectionRecord.election);
  apiMock.loadElection
    .expectCallWith({ electionData })
    .resolves(ok(primaryElectionRecord.election.id));
  apiMock.listElections.expectCallWith().resolves([primaryElectionRecord]);
  const loadElectionInput = screen.getByLabelText('Load Election');
  const file = new File([electionData], 'election.json', {
    type: 'application/json',
  });
  // JSDOM's File doesn't implement File.text
  file.text = () => Promise.resolve(electionData);
  userEvent.upload(loadElectionInput, file);
  await waitFor(() => {
    expect(history.location.pathname).toEqual(
      `/elections/${primaryElectionRecord.election.id}`
    );
  });
});

test('with elections', async () => {
  apiMock.listElections
    .expectCallWith()
    .resolves([generalElectionRecord, primaryElectionRecord]);
  const { history } = renderScreen();
  await screen.findByRole('heading', { name: 'Elections' });

  const table = screen.getByRole('table');
  const headers = within(table).getAllByRole('columnheader');
  expect(headers.map((header) => header.textContent)).toEqual([
    'Title',
    'Date',
    'Jurisdiction',
    'State',
  ]);
  const rows = within(table).getAllByRole('row').slice(1);
  expect(
    rows.map((row) =>
      within(row)
        .getAllByRole('cell')
        .map((cell) => cell.textContent)
    )
  ).toEqual([
    [
      generalElectionRecord.election.title,
      'November 3, 2020',
      generalElectionRecord.election.county.name,
      generalElectionRecord.election.state,
    ],
    [
      primaryElectionRecord.election.title,
      'September 8, 2021',
      primaryElectionRecord.election.county.name,
      primaryElectionRecord.election.state,
    ],
  ]);

  userEvent.click(rows[0]);
  await waitFor(() => {
    expect(history.location.pathname).toEqual(
      `/elections/${generalElectionRecord.election.id}`
    );
  });
});
