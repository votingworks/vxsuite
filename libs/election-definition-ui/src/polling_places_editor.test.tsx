import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { createMemoryHistory, type History } from 'history';
import { userEvent } from '@testing-library/user-event';
import { assertDefined } from '@votingworks/basics';
import { ElectionStringKey, type PollingPlace } from '@votingworks/types';
import {
  createMockApiClient,
  type MockApiClient,
  provideApi,
} from '../test/api_helpers.js';
import { act, render, screen, waitFor } from '../test/react_testing_library.js';
import { withRoute } from '../test/routing_helpers.js';
import {
  PollingPlacesEditor,
  type PollingPlacesEditorProps,
} from './polling_places_editor.js';
import {
  PollingPlaceList,
  type PollingPlaceListProps,
} from './polling_place_list.js';
import {
  PollingPlaceForm,
  type PollingPlaceFormProps,
} from './polling_place_form.js';

vi.mock('./polling_place_list.js');
const MockList = vi.mocked(PollingPlaceList);
const MOCK_LIST_ID = 'MockPollingPlaceList';

vi.mock('./polling_place_form.js');
const MockForm = vi.mocked(PollingPlaceForm);
const MOCK_FORM_ID = 'MockPollingPlaceForm';

const MOCK_AUDIO_PANEL_ID = 'MockAudioPanel';
function MockAudioPanel(): JSX.Element {
  return <div data-testid={MOCK_AUDIO_PANEL_ID} />;
}

const electionId = 'election-1';
const rootPath = `/elections/${electionId}/polling-places`;

function viewPath(placeId: string): string {
  return `${rootPath}/${placeId}`;
}

function editPath(placeId: string): string {
  return `${rootPath}/${placeId}/edit`;
}

function audioPath(placeId: string): string {
  return `${rootPath}/${placeId}/audio/${ElectionStringKey.POLLING_PLACE_NAME}`;
}

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

let apiMock: MockApiClient;

beforeEach(() => {
  apiMock = createMockApiClient();
  MockForm.mockReturnValue(<div data-testid={MOCK_FORM_ID} />);
  MockList.mockReturnValue(<div data-testid={MOCK_LIST_ID} />);
});

afterEach(() => {
  apiMock.assertComplete();
});

function mockSavedPlaces(places: PollingPlace[]) {
  apiMock.listPollingPlaces
    .expectRepeatedCallsWith({ electionId })
    .resolves(places);
}

function renderEditor(
  path = rootPath,
  props: Partial<PollingPlacesEditorProps> = {}
) {
  const history = createMemoryHistory({ initialEntries: [path] });
  render(
    provideApi(
      apiMock,
      withRoute(<PollingPlacesEditor electionId={electionId} {...props} />, {
        paramPath: '/elections/:electionId/polling-places',
        history,
      })
    )
  );
  return history;
}

function expectRoute(history: History, path: string) {
  expect(history.location.pathname).toEqual(path);
}

function expectFormWithProps(
  partial: Partial<PollingPlaceFormProps> & { editing: boolean }
) {
  screen.getByTestId(MOCK_FORM_ID);

  const props = assertDefined(MockForm.mock.lastCall?.[0]);
  expect(props).toEqual<PollingPlaceFormProps>({
    electionId,
    exit: expect.any(Function),
    switchToEdit: expect.any(Function),
    switchToView: expect.any(Function),
    ...partial,
  });

  return props;
}

test('empty state', async () => {
  mockSavedPlaces([]);

  const history = renderEditor();
  await screen.findByTestId(MOCK_LIST_ID);

  expectRoute(history, rootPath);
  expect(screen.queryByTestId(MOCK_FORM_ID)).not.toBeInTheDocument();
  expect(MockList.mock.lastCall?.[0]).toEqual<PollingPlaceListProps>({
    onSelect: expect.any(Function),
    places: [],
  });
});

test('polling place list is wired up', async () => {
  mockSavedPlaces([place1ElectionDay, place2EarlyVoting, place3Absentee]);

  const history = renderEditor(viewPath(place3Absentee.id));
  await screen.findByTestId(MOCK_FORM_ID);

  expectRoute(history, viewPath(place3Absentee.id));
  const listProps = assertDefined(MockList.mock.lastCall?.[0]);
  expect(listProps).toEqual<PollingPlaceListProps>({
    onSelect: expect.any(Function),
    places: [place1ElectionDay, place2EarlyVoting, place3Absentee],
    selectedId: place3Absentee.id,
  });

  act(() => listProps.onSelect(place1ElectionDay.id));
  expectRoute(history, viewPath(place1ElectionDay.id));
});

test('enter and exit "add" mode', async () => {
  mockSavedPlaces([]);

  const history = renderEditor();
  await userEvent.click(await screen.findButton('Add Polling Place'));
  expectRoute(history, `${rootPath}/add`);

  const props = expectFormWithProps({ editing: true });
  act(() => props.exit());
  expectRoute(history, rootPath);
});

test('switch from "add" to "view" mode', async () => {
  mockSavedPlaces([place1ElectionDay, place3Absentee]);

  const history = renderEditor(`${rootPath}/add`);
  await screen.findByTestId(MOCK_FORM_ID);

  const props = expectFormWithProps({ editing: true });
  act(() => props.switchToView(place1ElectionDay.id));
  expectRoute(history, viewPath(place1ElectionDay.id));
});

test('switch from "view" to "edit" mode', async () => {
  mockSavedPlaces([place1ElectionDay]);

  const history = renderEditor(viewPath(place1ElectionDay.id));
  await screen.findByTestId(MOCK_FORM_ID);

  const props = expectFormWithProps({
    editing: false,
    savedPlace: place1ElectionDay,
  });
  act(() => props.switchToEdit(place1ElectionDay.id));
  expectRoute(history, editPath(place1ElectionDay.id));
  expectFormWithProps({ editing: true, savedPlace: place1ElectionDay });
});

test('switch from "edit" to "view" mode', async () => {
  mockSavedPlaces([place1ElectionDay]);

  const history = renderEditor(editPath(place1ElectionDay.id));
  await screen.findByTestId(MOCK_FORM_ID);

  const props = expectFormWithProps({
    editing: true,
    savedPlace: place1ElectionDay,
  });
  act(() => props.switchToView(place1ElectionDay.id));
  expectRoute(history, viewPath(place1ElectionDay.id));
});

test('exit "view" and "edit" mode after delete', async () => {
  mockSavedPlaces([place1ElectionDay, place2EarlyVoting]);

  const history = renderEditor(viewPath(place1ElectionDay.id));
  await screen.findByTestId(MOCK_FORM_ID);
  act(() =>
    expectFormWithProps({
      editing: false,
      savedPlace: place1ElectionDay,
    }).exit()
  );
  expectRoute(history, rootPath);

  act(() => history.replace(editPath(place2EarlyVoting.id)));
  await waitFor(() =>
    expectFormWithProps({ editing: true, savedPlace: place2EarlyVoting })
  );
  act(() => assertDefined(MockForm.mock.lastCall?.[0]).exit());
  expectRoute(history, rootPath);
});

test('unknown polling places redirect to the root route', async () => {
  mockSavedPlaces([place1ElectionDay]);

  const history = renderEditor(viewPath('unknown'));
  await waitFor(() => expectRoute(history, rootPath));
});

test('renders the audio panel for its route', async () => {
  mockSavedPlaces([place1ElectionDay]);

  renderEditor(audioPath(place1ElectionDay.id), {
    AudioPanel: MockAudioPanel,
  });

  await screen.findByTestId(MOCK_AUDIO_PANEL_ID);
  screen.getByTestId(MOCK_LIST_ID);
  expect(screen.queryByTestId(MOCK_FORM_ID)).not.toBeInTheDocument();
});

test('passes an audio url to the form only with an audio panel', async () => {
  mockSavedPlaces([place1ElectionDay]);

  const history = renderEditor(viewPath(place1ElectionDay.id), {
    AudioPanel: MockAudioPanel,
  });
  await screen.findByTestId(MOCK_FORM_ID);

  const { audioUrl } = expectFormWithProps({
    audioUrl: expect.any(Function),
    editing: false,
    savedPlace: place1ElectionDay,
  });
  expect(
    assertDefined(audioUrl)({
      id: place1ElectionDay.id,
      stringKey: ElectionStringKey.POLLING_PLACE_NAME,
    })
  ).toEqual(audioPath(place1ElectionDay.id));
  expectRoute(history, viewPath(place1ElectionDay.id));
});

test('the audio route shows the polling place without an audio panel', async () => {
  mockSavedPlaces([place1ElectionDay]);

  const history = renderEditor(audioPath(place1ElectionDay.id));

  await waitFor(() => expectRoute(history, viewPath(place1ElectionDay.id)));
  expectFormWithProps({ editing: false, savedPlace: place1ElectionDay });
});

test('disables adding and editing when locked', async () => {
  mockSavedPlaces([place1ElectionDay, place3Absentee]);

  const history = renderEditor(editPath(place3Absentee.id), {
    isLocked: true,
  });

  await waitFor(() => expectRoute(history, viewPath(place3Absentee.id)));
  expect(screen.getButton('Add Polling Place')).toBeDisabled();
  expectFormWithProps({
    editing: false,
    isLocked: true,
    savedPlace: place3Absentee,
  });

  const listProps = assertDefined(MockList.mock.lastCall?.[0]);
  act(() => listProps.onSelect(place1ElectionDay.id));
  expectRoute(history, viewPath(place1ElectionDay.id));
});
