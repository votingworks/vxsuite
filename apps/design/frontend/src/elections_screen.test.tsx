import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { useState } from 'react';
import { assertDefined, ok } from '@votingworks/basics';
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
} from '../test/api_helpers.js';
import {
  blankElectionRecord,
  electionListing,
  generalElectionRecord,
  primaryElectionRecord,
} from '../test/fixtures.js';
import {
  render,
  screen,
  waitFor,
  within,
} from '../test/react_testing_library.js';
import { withRoute } from '../test/routing_helpers.js';
import { ElectionsScreen } from './elections_screen.js';
import { routes } from './routes.js';

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

  const electionRecord = blankElectionRecord(jurisdiction);
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

function getElectionItem(title: string): HTMLElement {
  const heading = screen.getByRole('heading', { name: title });
  return assertDefined(heading.closest<HTMLElement>('[role="button"]'));
}

function getElectionItemTitles() {
  return screen
    .getAllByRole('heading', { level: 3 })
    .map((heading) => heading.textContent);
}

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

  expect(getElectionItemTitles()).toEqual([
    general.election.title,
    primary.election.title,
  ]);

  const generalRow = getElectionItem(general.election.title);
  within(generalRow).getByText('Nov 3, 2020');
  within(generalRow).getByText('In Progress');
  // No jurisdiction shown for single-jurisdiction users
  expect(generalRow).not.toHaveTextContent('jurisdiction1 Name');

  const primaryRow = getElectionItem(primary.election.title);
  within(primaryRow).getByText('Sep 8, 2021');
  within(primaryRow).getByText('In Progress');
});

test('clicking an election item navigates to the election', async () => {
  const general = generalElectionRecord(jurisdiction.id);
  apiMock.getUser.expectCallWith().resolves(user);
  apiMock.listElections.expectCallWith().resolves([electionListing(general)]);

  const { history } = renderScreen();
  await screen.findByRole('heading', { name: 'Elections' });

  userEvent.click(getElectionItem(general.election.title));
  expect(history.location.pathname).toEqual(
    `/elections/${general.election.id}`
  );
});

test('election status indicators', async () => {
  const general = generalElectionRecord(jurisdiction.id);
  function listing(
    electionId: string,
    title: string,
    status: ElectionListing['status']
  ): ElectionListing {
    return {
      ...electionListing(general),
      electionId: unsafeParse(ElectionIdSchema, electionId),
      title,
      status,
    };
  }
  apiMock.getUser.expectCallWith().resolves(user);
  apiMock.listElections
    .expectCallWith()
    .resolves([
      listing('not-started', 'Not Started Election', 'notStarted'),
      listing('in-progress', 'In Progress Election', 'inProgress'),
      listing('finalized', 'Finalized Election', 'ballotsFinalized'),
      listing('approved', 'Approved Election', 'ballotsApproved'),
    ]);

  renderScreen();
  await screen.findByRole('heading', { name: 'Elections' });

  within(getElectionItem('Not Started Election')).getByText('In Progress');
  within(getElectionItem('In Progress Election')).getByText('In Progress');
  within(getElectionItem('Finalized Election')).getByText('Finalized');
  within(getElectionItem('Approved Election')).getByText('Finalized');
});

test('elections list for user with multiple jurisdictions', async () => {
  const generalJurisdiction1 = generalElectionRecord(jurisdiction.id);
  const generalJurisdiction2 = blankElectionRecord(jurisdiction2);
  apiMock.getUser.expectCallWith().resolves(user);
  apiMock.listElections
    .expectCallWith()
    .resolves([
      electionListing(generalJurisdiction1),
      electionListing(generalJurisdiction2),
    ]);

  renderScreen();
  await screen.findByRole('heading', { name: 'Elections' });

  expect(getElectionItemTitles()).toEqual([
    generalJurisdiction1.election.title,
    'Untitled Election',
  ]);

  // Rows show each election's jurisdiction in the subtitle
  const firstRow = getElectionItem(generalJurisdiction1.election.title);
  within(firstRow).getByText(/jurisdiction1 Name/);

  const secondRow = getElectionItem('Untitled Election');
  within(secondRow).getByText(
    new RegExp(
      format.localeDate(
        generalJurisdiction2.election.date.toMidnightDatetimeWithSystemTimezone()
      )
    )
  );
  within(secondRow).getByText(/jurisdiction2 Name/);

  // Can filter by jurisdiction name
  const filterInput = screen.getByLabelText(/filter elections/i);
  userEvent.type(filterInput, 'jurisdiction2 Name');

  expect(getElectionItemTitles()).toEqual(['Untitled Election']);
});
