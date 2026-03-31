import { beforeEach, expect, test, vi } from 'vitest';
import { StateFeaturesConfig } from '@votingworks/design-backend';
import { createMemoryHistory, History } from 'history';
import {
  DEFAULT_SYSTEM_SETTINGS,
  ElectionStringKey,
  PollingPlace,
} from '@votingworks/types';
import { assertDefined } from '@votingworks/basics';
import userEvent from '@testing-library/user-event';
import {
  MockApiClient,
  createMockApiClient,
  mockStateFeatures,
  mockUserFeatures,
  jurisdiction,
  provideApi,
  user,
} from '../test/api_helpers';
import {
  electionInfoFromElection,
  generalElectionRecord,
} from '../test/fixtures';
import { withRoute } from '../test/routing_helpers';
import { routes } from './routes';
import { act, render, screen, waitFor } from '../test/react_testing_library';
import { PollingPlacesScreen } from './polling_places_screen';
import { PollingPlaceList, PollingPlaceListProps } from './polling_place_list';
import { PollingPlaceAudioPanel } from './polling_place_audio_panel';
import { PollingPlaceForm, PollingPlaceFormProps } from './polling_place_form';

vi.mock('./polling_place_list.js');
const MockList = vi.mocked(PollingPlaceList);
const MOCK_LIST_ID = 'MockPollingPlaceList';

vi.mock('./polling_place_audio_panel.js');
const MockAudioPanel = vi.mocked(PollingPlaceAudioPanel);
const MOCK_AUDIO_PANEL_ID = 'MockPollingPlaceAudioPanel';

vi.mock('./polling_place_form.js');
const MockForm = vi.mocked(PollingPlaceForm);
const MOCK_FORM_ID = 'MockPollingPlaceForm';

const { election } = generalElectionRecord(jurisdiction.id);
const electionId = election.id;
const placeRoutes = routes.election(electionId).pollingPlaces;

const place1ElectionDay: PollingPlace = {
  id: 'place1_election_day',
  name: 'Place 1 - Election Day',
  precincts: {},
  type: 'election_day',
};

const place2EarlyVoting: PollingPlace = {
  id: 'place2_early_voting',
  name: 'Place 2 - Early Voting',
  precincts: { precinct2: { type: 'whole' } },
  type: 'early_voting',
};

const place3Absentee: PollingPlace = {
  id: 'place3_absentee',
  name: 'Place 3 - Absentee',
  precincts: { precinct3: { type: 'whole' } },
  type: 'absentee',
};

beforeEach(() => {
  MockForm.mockReturnValue(<div data-testid={MOCK_FORM_ID} />);
  MockList.mockReturnValue(<div data-testid={MOCK_LIST_ID} />);
  MockAudioPanel.mockReturnValue(<div data-testid={MOCK_AUDIO_PANEL_ID} />);
});

test('EDIT_POLLING_PLACES == false - no link in left nav', async () => {
  const api = createMockApiClient();
  mockNavScreenDependencies(api, { EDIT_POLLING_PLACES: false });
  mockFinalizedDate(api, null);
  mockSavedPlaces(api, []);

  renderScreen(api);
  await waitFor(() => api.assertComplete());

  expect(screen.queryButton('Polling Places')).not.toBeInTheDocument();
});

test('EDIT_POLLING_PLACES == true - link present in left nav', async () => {
  const api = createMockApiClient();
  mockNavScreenDependencies(api, { EDIT_POLLING_PLACES: true });
  mockFinalizedDate(api, null);
  mockSavedPlaces(api, []);

  renderScreen(api);
  await waitFor(() => api.assertComplete());

  screen.getButton('Polling Places');
});

test('empty state', async () => {
  const api = createMockApiClient();
  mockNavScreenDependencies(api, { EDIT_POLLING_PLACES: true });
  mockFinalizedDate(api, null);
  mockSavedPlaces(api, []);

  const { history } = renderScreen(api);
  await waitFor(() => api.assertComplete());

  expectRootRoute(history);
  expect(screen.queryByTestId(MOCK_FORM_ID)).not.toBeInTheDocument();
  expect(screen.queryByTestId(MOCK_AUDIO_PANEL_ID)).not.toBeInTheDocument();

  screen.getByTestId(MOCK_LIST_ID);
  expect(MockList.mock.lastCall?.[0]).toEqual<PollingPlaceListProps>({
    onSelect: expect.any(Function),
    places: [],
  });
});

test('polling place list is wired up', async () => {
  const api = createMockApiClient();
  mockNavScreenDependencies(api);
  mockFinalizedDate(api, null);
  mockSavedPlaces(api, [place1ElectionDay, place2EarlyVoting, place3Absentee]);

  const { history } = renderScreen(api, placeRoutes.view(place3Absentee.id));
  await waitFor(() => api.assertComplete());

  expectViewRoute(history, place3Absentee.id);
  screen.getByTestId(MOCK_FORM_ID);
  expect(screen.queryByTestId(MOCK_AUDIO_PANEL_ID)).not.toBeInTheDocument();

  screen.getByTestId(MOCK_LIST_ID);
  const listProps = assertDefined(MockList.mock.lastCall?.[0]);
  expect(listProps).toEqual<PollingPlaceListProps>({
    onSelect: expect.any(Function),
    places: [place1ElectionDay, place2EarlyVoting, place3Absentee],
    selectedId: place3Absentee.id,
  });

  act(() => listProps.onSelect(place1ElectionDay.id));
  expectViewRoute(history, place1ElectionDay.id);
});

test('enter and exit "add" mode', async () => {
  const api = createMockApiClient();
  mockNavScreenDependencies(api, { EDIT_POLLING_PLACES: true });
  mockFinalizedDate(api, null);
  mockSavedPlaces(api, []);

  const { history } = renderScreen(api);
  await waitFor(() => api.assertComplete());
  expectRootRoute(history);

  userEvent.click(screen.getButton('Add Polling Place'));
  expectAddRoute(history);

  const props = expectFormWithProps({ editing: true, savedPlace: undefined });
  act(() => props.exit());
  expectRootRoute(history);
});

test('switch from "add" to "view" mode', async () => {
  const api = createMockApiClient();
  mockNavScreenDependencies(api, { EDIT_POLLING_PLACES: true });
  mockFinalizedDate(api, null);
  mockSavedPlaces(api, [place1ElectionDay, place3Absentee]);

  const { history } = renderScreen(api);
  await waitFor(() => api.assertComplete());
  expectRootRoute(history);

  userEvent.click(screen.getButton('Add Polling Place'));
  expectAddRoute(history);

  const props = expectFormWithProps({ editing: true, savedPlace: undefined });

  // Simulates switching to "view" after adding a new place:
  act(() => props.switchToView(place1ElectionDay.id));
  expectViewRoute(history, place1ElectionDay.id);
});

test('switch from "view" to "edit" mode', async () => {
  const api = createMockApiClient();
  mockNavScreenDependencies(api, { EDIT_POLLING_PLACES: true });
  mockFinalizedDate(api, null);
  mockSavedPlaces(api, [place1ElectionDay]);

  const { history } = renderScreen(api, placeRoutes.view(place1ElectionDay.id));
  await waitFor(() => api.assertComplete());
  expectViewRoute(history, place1ElectionDay.id);

  const props = expectFormWithProps({
    editing: false,
    savedPlace: place1ElectionDay,
  });
  props.switchToEdit(place1ElectionDay.id);

  expectEditRoute(history, place1ElectionDay.id);
  screen.getByTestId(MOCK_LIST_ID);
  expect(screen.queryByTestId(MOCK_AUDIO_PANEL_ID)).not.toBeInTheDocument();
});

test('switch from "edit" to "view" mode form', async () => {
  const api = createMockApiClient();
  mockNavScreenDependencies(api, { EDIT_POLLING_PLACES: true });
  mockFinalizedDate(api, null);
  mockSavedPlaces(api, [place1ElectionDay]);

  const { history } = renderScreen(api, placeRoutes.edit(place1ElectionDay.id));
  await waitFor(() => api.assertComplete());

  expectEditRoute(history, place1ElectionDay.id);
  screen.getByTestId(MOCK_LIST_ID);
  expect(screen.queryByTestId(MOCK_AUDIO_PANEL_ID)).not.toBeInTheDocument();

  const props = expectFormWithProps({
    editing: true,
    savedPlace: place1ElectionDay,
  });

  act(() => props.switchToView(place1ElectionDay.id));
  expectViewRoute(history, place1ElectionDay.id);
});

test('exit "view" mode after delete', async () => {
  const api = createMockApiClient();
  mockNavScreenDependencies(api, { EDIT_POLLING_PLACES: true });
  mockFinalizedDate(api, null);
  mockSavedPlaces(api, [place1ElectionDay, place2EarlyVoting]);

  const { history } = renderScreen(api, placeRoutes.view(place1ElectionDay.id));
  await waitFor(() => api.assertComplete());

  expectViewRoute(history, place1ElectionDay.id);
  screen.getByTestId(MOCK_LIST_ID);
  expect(screen.queryByTestId(MOCK_AUDIO_PANEL_ID)).not.toBeInTheDocument();

  const props = expectFormWithProps({
    editing: false,
    savedPlace: place1ElectionDay,
  });

  act(() => props.exit());
  expectRootRoute(history);
});

test('exit "edit" mode after delete', async () => {
  const api = createMockApiClient();
  mockNavScreenDependencies(api, { EDIT_POLLING_PLACES: true });
  mockFinalizedDate(api, null);
  mockSavedPlaces(api, [place1ElectionDay, place2EarlyVoting]);

  const { history } = renderScreen(api, placeRoutes.edit(place1ElectionDay.id));
  await waitFor(() => api.assertComplete());

  expectEditRoute(history, place1ElectionDay.id);
  screen.getByTestId(MOCK_LIST_ID);
  expect(screen.queryByTestId(MOCK_AUDIO_PANEL_ID)).not.toBeInTheDocument();

  const props = expectFormWithProps({
    editing: true,
    savedPlace: place1ElectionDay,
  });

  act(() => props.exit());
  expectRootRoute(history);
});

test('renders audio panel for matching route', async () => {
  const api = createMockApiClient();
  mockNavScreenDependencies(api, { EDIT_POLLING_PLACES: true });
  mockFinalizedDate(api, null);
  mockSavedPlaces(api, [place1ElectionDay]);

  const { history } = renderScreen(
    api,
    placeRoutes.audio({
      placeId: place1ElectionDay.id,
      stringKey: ElectionStringKey.POLLING_PLACE_NAME,
    })
  );
  await waitFor(() => api.assertComplete());

  expectAudioRoute(history, place1ElectionDay.id);
  screen.getByTestId(MOCK_LIST_ID);
  expect(screen.queryByTestId(MOCK_FORM_ID)).not.toBeInTheDocument();
});

test('disables "add" button if ballots are finalized', async () => {
  const api = createMockApiClient();
  mockNavScreenDependencies(api, { EDIT_POLLING_PLACES: true });
  mockFinalizedDate(api, new Date());
  mockSavedPlaces(api, [place1ElectionDay, place3Absentee]);

  const { history } = renderScreen(api, placeRoutes.edit(place3Absentee.id));
  await waitFor(() => api.assertComplete());

  expectViewRoute(history, place3Absentee.id);
  expect(screen.getButton('Add Polling Place')).toBeDisabled();

  screen.getByTestId(MOCK_LIST_ID);
  screen.getByTestId(MOCK_FORM_ID);
  expect(screen.queryByTestId(MOCK_AUDIO_PANEL_ID)).not.toBeInTheDocument();

  // Navigation between polling places should still work:
  const listProps = assertDefined(MockList.mock.lastCall?.[0]);
  act(() => listProps.onSelect(place1ElectionDay.id));
  expectViewRoute(history, place1ElectionDay.id);
});

function expectAddRoute(history: History) {
  expect(history.location.pathname).toEqual(placeRoutes.add);
}

function expectAudioRoute(history: History, placeId: string) {
  expect(history.location.pathname).toEqual(
    placeRoutes.audio({
      placeId,
      stringKey: ElectionStringKey.POLLING_PLACE_NAME,
    })
  );
}

function expectEditRoute(history: History, placeId: string) {
  expect(history.location.pathname).toEqual(placeRoutes.edit(placeId));
  screen.getByRole('heading', { name: 'Polling Places' });
}

function expectFormWithProps(partial: {
  editing: boolean;
  savedPlace?: PollingPlace;
}) {
  screen.getByTestId(MOCK_FORM_ID);

  const props = assertDefined(MockForm.mock.lastCall?.[0]);
  expect(props).toEqual<PollingPlaceFormProps>({
    ...partial,
    electionId,
    exit: expect.any(Function),
    switchToEdit: expect.any(Function),
    switchToView: expect.any(Function),
  });

  return props;
}

function expectRootRoute(history: History) {
  expect(history.location.pathname).toEqual(placeRoutes.root.path);
  screen.getByRole('heading', { name: 'Polling Places' });
}

function expectViewRoute(history: History, placeId: string) {
  expect(history.location.pathname).toEqual(placeRoutes.view(placeId));
  screen.getByRole('heading', { name: 'Polling Places' });
}

function mockFinalizedDate(api: MockApiClient, date: Date | null) {
  api.getBallotsFinalizedAt
    .expectRepeatedCallsWith({ electionId })
    .resolves(date);
}

function mockNavScreenDependencies(
  api: MockApiClient,
  features?: StateFeaturesConfig
) {
  mockUserFeatures(api);
  mockStateFeatures(api, electionId, features);
  api.getUser.expectCallWith().resolves(user);

  api.getElectionInfo
    .expectRepeatedCallsWith({ electionId })
    .resolves(electionInfoFromElection(election));

  api.getSystemSettings
    .expectRepeatedCallsWith({ electionId })
    .resolves(DEFAULT_SYSTEM_SETTINGS);
}

function mockSavedPlaces(api: MockApiClient, places: PollingPlace[]) {
  api.listPollingPlaces
    .expectRepeatedCallsWith({ electionId })
    .resolves(places);
}

function renderScreen(api: MockApiClient, path = placeRoutes.root.path) {
  const history = createMemoryHistory({ initialEntries: [path] });

  render(
    provideApi(
      api,
      withRoute(<PollingPlacesScreen />, {
        history,
        paramPath: routes.election(':electionId').pollingPlaces.root.path,
        path,
      })
    )
  );

  return { history };
}
