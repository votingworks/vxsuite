import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { makeIdFactory } from '@votingworks/test-utils';
import type { StateFeaturesConfig } from '@votingworks/hub-backend';
import { createMemoryHistory } from 'history';
import {
  DEFAULT_SYSTEM_SETTINGS,
  ElectionStringKey,
  type PollingPlace,
} from '@votingworks/types';
import { assertDefined, ok } from '@votingworks/basics';
import { userEvent } from '@testing-library/user-event';
import {
  type MockApiClient,
  createMockApiClient,
  mockStateFeatures,
  mockUserFeatures,
  jurisdiction,
  provideApi,
  user,
} from '../test/api_helpers.js';
import {
  electionInfoFromElection,
  generalElectionRecord,
} from '../test/fixtures.js';
import { withRoute } from '../test/routing_helpers.js';
import { routes } from './routes.js';
import {
  render,
  screen,
  waitFor,
  within,
} from '../test/react_testing_library.js';
import { PollingPlacesScreen } from './polling_places_screen.js';
import { PollingPlaceAudioPanel } from './polling_place_audio_panel.js';

vi.mock('./polling_place_audio_panel.js');
const MockAudioPanel = vi.mocked(PollingPlaceAudioPanel);
const MOCK_AUDIO_PANEL_ID = 'MockPollingPlaceAudioPanel';

const { election } = generalElectionRecord(jurisdiction.id);
const electionId = election.id;
const placeRoutes = routes.election(electionId).pollingPlaces;

const idFactory = makeIdFactory();

const place: PollingPlace = {
  id: 'place-1',
  name: 'Town Hall',
  precincts: { [election.precincts[0]!.id]: { type: 'whole' } },
  type: 'election_day',
};

let apiMock: MockApiClient;

beforeEach(() => {
  apiMock = createMockApiClient();
  idFactory.reset();
  MockAudioPanel.mockReturnValue(<div data-testid={MOCK_AUDIO_PANEL_ID} />);
});

afterEach(() => {
  apiMock.assertComplete();
});

function mockScreenDependencies(
  features: StateFeaturesConfig = { EDIT_POLLING_PLACES: true },
  finalizedAt: Date | null = null
) {
  mockUserFeatures(apiMock);
  mockStateFeatures(apiMock, electionId, features);
  apiMock.getUser.expectCallWith().resolves(user);
  apiMock.getElectionInfo
    .expectRepeatedCallsWith({ electionId })
    .resolves(electionInfoFromElection(election));
  apiMock.getSystemSettings
    .expectRepeatedCallsWith({ electionId })
    .resolves(DEFAULT_SYSTEM_SETTINGS);
  apiMock.getBallotsFinalizedAt
    .expectCallWith({ electionId })
    .resolves(finalizedAt);
}

function renderScreen(path = placeRoutes.root.path) {
  const history = createMemoryHistory({ initialEntries: [path] });
  render(
    provideApi(
      apiMock,
      withRoute(<PollingPlacesScreen />, {
        history,
        paramPath: routes.election(':electionId').pollingPlaces.root.path,
        path,
      })
    )
  );
  return history;
}

test('EDIT_POLLING_PLACES == false - no link in left nav', async () => {
  mockScreenDependencies({ EDIT_POLLING_PLACES: false });
  apiMock.listPollingPlaces.expectCallWith({ electionId }).resolves([]);

  renderScreen();
  await screen.findByText(/you haven't added any polling places/i);

  expect(screen.queryButton('Polling Places')).not.toBeInTheDocument();
});

test('EDIT_POLLING_PLACES == true - link present in left nav', async () => {
  mockScreenDependencies();
  apiMock.listPollingPlaces.expectCallWith({ electionId }).resolves([]);

  renderScreen();
  await screen.findByText(/you haven't added any polling places/i);

  screen.getButton('Polling Places');
});

test('adding a polling place', async () => {
  mockScreenDependencies();
  apiMock.listPollingPlaces.expectCallWith({ electionId }).resolves([]);
  apiMock.listPrecincts
    .expectRepeatedCallsWith({ electionId })
    .resolves(election.precincts);

  const history = renderScreen();
  await screen.findByRole('heading', { name: 'Polling Places' });
  await userEvent.click(await screen.findButton('Add Polling Place'));
  await screen.findByRole('heading', { name: 'Add Polling Place' });
  expect(history.location.pathname).toEqual(`${placeRoutes.root.path}/add`);

  await userEvent.type(screen.getByLabelText('Name'), place.name);
  await userEvent.click(
    screen.getByRole('checkbox', { name: election.precincts[0]!.name })
  );

  idFactory.next(); // Discarded by StrictMode's double render of the blank form
  const newPlace: PollingPlace = { ...place, id: idFactory.next() };
  apiMock.setPollingPlace
    .expectCallWith({ electionId, place: newPlace })
    .resolves(ok());
  apiMock.listPollingPlaces
    .expectRepeatedCallsWith({ electionId })
    .resolves([newPlace]);
  await userEvent.click(screen.getButton('Save'));

  await screen.findByRole('heading', { name: 'Polling Place Info' });
  expect(history.location.pathname).toEqual(placeRoutes.view(newPlace.id));
});

test('editing or adding a polling place is disabled when ballots are finalized', async () => {
  mockScreenDependencies(undefined, new Date());
  apiMock.listPollingPlaces
    .expectRepeatedCallsWith({ electionId })
    .resolves([place]);
  apiMock.listPrecincts
    .expectRepeatedCallsWith({ electionId })
    .resolves(election.precincts);

  const history = renderScreen(`${placeRoutes.view(place.id)}/edit`);

  await screen.findByRole('heading', { name: 'Polling Place Info' });
  await waitFor(() =>
    expect(history.location.pathname).toEqual(placeRoutes.view(place.id))
  );
  expect(screen.getButton('Add Polling Place')).toBeDisabled();
  expect(screen.queryButton('Edit')).not.toBeInTheDocument();
  expect(screen.queryButton('Delete Polling Place')).not.toBeInTheDocument();
});

test('configures the audio edit button for the polling place name', async () => {
  mockScreenDependencies({ EDIT_POLLING_PLACES: true, AUDIO_ENABLED: true });
  apiMock.listPollingPlaces
    .expectRepeatedCallsWith({ electionId })
    .resolves([place]);
  apiMock.listPrecincts
    .expectRepeatedCallsWith({ electionId })
    .resolves(election.precincts);

  const history = renderScreen(placeRoutes.view(place.id));

  const input = await screen.findByDisplayValue(place.name);
  const inputGroup = assertDefined(input.closest('label'));
  await userEvent.click(within(inputGroup).getButton(/preview or edit audio/i));

  await screen.findByTestId(MOCK_AUDIO_PANEL_ID);
  expect(history.location.pathname).toEqual(
    `${placeRoutes.view(place.id)}/audio/${ElectionStringKey.POLLING_PLACE_NAME}`
  );
});
