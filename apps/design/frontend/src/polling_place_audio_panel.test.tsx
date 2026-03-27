import { beforeEach, expect, test, vi } from 'vitest';
import { createMemoryHistory } from 'history';
import { Route, Router, Switch } from 'react-router-dom';

import { ElectionInfo, TtsStringDefault } from '@votingworks/design-backend';
import { ElectionStringKey, LanguageCode } from '@votingworks/types';
import userEvent from '@testing-library/user-event';

import { createMockApiClient, provideApi } from '../test/api_helpers';
import { PollingPlaceAudioPanel } from './polling_place_audio_panel';
import { electionParamRoutes, routes } from './routes';
import { AudioEditorPanel } from './ballot_audio/audio_editor_panel';
import { render, screen, waitFor } from '../test/react_testing_library';

vi.mock('./ballot_audio/audio_editor_panel', async (importActual) => ({
  ...(await importActual()),
  AudioEditorPanel: vi.fn(),
}));

const electionId = 'election-1';
const jurisdictionId = 'jurisdiction-1';
const placeId = 'pollingPlace1';

const pollingPlaceParamRoutes = electionParamRoutes.pollingPlaces;
const pollingPlaceRoutes = routes.election(electionId).pollingPlaces;

const Key = ElectionStringKey;

const MockAudioEditorPanel = vi.mocked(AudioEditorPanel);
const AUDIO_EDIT_PANEL_TEST_ID = 'MockAudioEditorPanel';

beforeEach(() => {
  MockAudioEditorPanel.mockImplementation((props) => {
    const { header } = props;
    return <div data-testid={AUDIO_EDIT_PANEL_TEST_ID}>{header}</div>;
  });
});

test(`renders for ElectionStringKey.POLLING_PLACE_NAME`, async () => {
  const ttsDefaults: TtsStringDefault[] = [
    { key: Key.POLLING_PLACE_NAME, subkey: 'other-1', text: 'Other Place' },
    { key: Key.POLLING_PLACE_NAME, subkey: placeId, text: 'Place Name' },
  ];
  const { history } = renderPanel(ttsDefaults, {
    placeId,
    stringKey: Key.POLLING_PLACE_NAME,
  });

  await screen.findByRole('heading', { name: 'Polling Place Audio: Name' });
  expect(MockAudioEditorPanel.mock.lastCall?.[0]).toMatchObject({
    electionId,
    jurisdictionId,
    languageCode: LanguageCode.ENGLISH,
    ttsDefault: ttsDefaults[1],
  });

  userEvent.click(screen.getButton('Polling Place Info'));
  expect(history.location.pathname).toEqual(pollingPlaceRoutes.view(placeId));
});

test('redirects to pollingPlaces view for unmatched string subkeys', async () => {
  const ttsDefaults: TtsStringDefault[] = [
    { key: Key.POLLING_PLACE_NAME, subkey: 'other-1', text: 'Other Place' },
  ];

  const { history } = renderPanel(ttsDefaults, {
    placeId,
    stringKey: Key.POLLING_PLACE_NAME,
  });

  await waitFor(() => {
    expect(history.location.pathname).toEqual(pollingPlaceRoutes.view(placeId));
  });
  expect(
    screen.queryByRole('heading', { name: /Polling Place Audio/ })
  ).not.toBeInTheDocument();
});

test('redirects to polling place info form for invalid string keys', async () => {
  const ttsDefaults: TtsStringDefault[] = [
    { key: Key.CONTEST_TITLE, subkey: placeId, text: 'Contest Title' },
  ];

  const { history } = renderPanel(ttsDefaults, {
    placeId,
    stringKey: Key.CONTEST_TITLE,
  });

  await waitFor(() => {
    expect(history.location.pathname).toEqual(pollingPlaceRoutes.view(placeId));
  });
  expect(
    screen.queryByRole('heading', { name: /Polling Place Audio/ })
  ).not.toBeInTheDocument();
});

function renderPanel(
  ttsDefaults: TtsStringDefault[],
  pathParams: {
    placeId: string;
    stringKey: ElectionStringKey;
  }
) {
  const history = createMemoryHistory({
    initialEntries: [pollingPlaceRoutes.audio(pathParams)],
  });

  const mockApi = createMockApiClient();

  const partialElection: Partial<ElectionInfo> = { jurisdictionId };
  mockApi.getElectionInfo
    .expectCallWith({ electionId })
    .resolves(partialElection as ElectionInfo);

  mockApi.ttsStringDefaults
    .expectCallWith({ electionId })
    .resolves(ttsDefaults);

  const result = render(
    provideApi(
      mockApi,
      <Router history={history}>
        <Switch>
          <Route
            exact
            path={pollingPlaceParamRoutes.audio({
              placeId: ':placeId',
              stringKey: ':stringKey',
            })}
            component={PollingPlaceAudioPanel}
          />
          <Route exact path={pollingPlaceParamRoutes.root.path} />
        </Switch>
      </Router>
    )
  );

  mockApi.assertComplete();

  return { history, result };
}
