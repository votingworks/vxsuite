import { beforeEach, expect, test, vi } from 'vitest';
import { createMemoryHistory } from 'history';
import { Route, Router, Switch } from 'react-router-dom';

import { ElectionInfo, TtsStringDefault } from '@votingworks/design-backend';
import { ElectionStringKey, LanguageCode } from '@votingworks/types';
import userEvent from '@testing-library/user-event';

import { createMockApiClient, provideApi } from '../test/api_helpers';
import { DistrictAudioPanel } from './district_audio_panel';
import { electionParamRoutes, routes } from './routes';
import { AudioEditorPanel } from './ballot_audio/audio_editor_panel';
import { render, screen, waitFor } from '../test/react_testing_library';

vi.mock('./ballot_audio/audio_editor_panel', async (importActual) => ({
  ...(await importActual()),
  AudioEditorPanel: vi.fn(),
}));

const electionId = 'election-1';
const jurisdictionId = 'jurisdiction-1';
const districtId = 'district-1';

const districtParamRoutes = electionParamRoutes.districts;
const districtRoutes = routes.election(electionId).districts;

const Key = ElectionStringKey;

const MockAudioEditorPanel = vi.mocked(AudioEditorPanel);
const AUDIO_EDIT_PANEL_TEST_ID = 'MockAudioEditorPanel';

beforeEach(() => {
  MockAudioEditorPanel.mockImplementation((props) => {
    const { header } = props;
    return <div data-testid={AUDIO_EDIT_PANEL_TEST_ID}>{header}</div>;
  });
});

test(`renders for ElectionStringKey.DISTRICT_NAME`, async () => {
  const ttsDefaults: TtsStringDefault[] = [
    { key: Key.DISTRICT_NAME, subkey: 'other-1', text: 'Other District' },
    { key: Key.DISTRICT_NAME, subkey: districtId, text: 'District Name' },
  ];
  const { history } = renderPanel(ttsDefaults, {
    stringKey: Key.DISTRICT_NAME,
    subkey: districtId,
  });

  await screen.findByRole('heading', { name: 'District Audio: Name' });
  expect(MockAudioEditorPanel.mock.lastCall?.[0]).toMatchObject({
    electionId,
    jurisdictionId,
    languageCode: LanguageCode.ENGLISH,
    ttsDefault: ttsDefaults[1],
  });

  userEvent.click(screen.getButton('Close'));
  expect(history.location.pathname).toEqual(districtRoutes.root.path);
});

test('redirects to districts view for unmatched string subkeys', async () => {
  const ttsDefaults: TtsStringDefault[] = [
    { key: Key.DISTRICT_NAME, subkey: districtId, text: 'Other District' },
  ];

  const { history } = renderPanel(ttsDefaults, {
    stringKey: Key.DISTRICT_NAME,
    subkey: 'stale-district-id',
  });

  await waitFor(() => {
    expect(history.location.pathname).toEqual(districtRoutes.root.path);
  });
  expect(
    screen.queryByRole('heading', { name: /District Audio/ })
  ).not.toBeInTheDocument();
});

test('redirects to district view for invalid string keys', async () => {
  const ttsDefaults: TtsStringDefault[] = [
    { key: Key.CONTEST_TITLE, subkey: districtId, text: 'Contest Title' },
  ];

  const { history } = renderPanel(ttsDefaults, {
    stringKey: Key.CONTEST_TITLE,
    subkey: districtId,
  });

  await waitFor(() => {
    expect(history.location.pathname).toEqual(districtRoutes.root.path);
  });
  expect(
    screen.queryByRole('heading', { name: /District Audio/ })
  ).not.toBeInTheDocument();
});

function renderPanel(
  ttsDefaults: TtsStringDefault[],
  ttsString: { stringKey: ElectionStringKey; subkey: string }
) {
  const history = createMemoryHistory({
    initialEntries: [districtRoutes.audio({ ...ttsString })],
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
            path={districtParamRoutes.audio({
              stringKey: ':stringKey',
              subkey: ':subkey',
            })}
            component={DistrictAudioPanel}
          />
          <Route exact path={districtParamRoutes.root.path} />
        </Switch>
      </Router>
    )
  );

  mockApi.assertComplete();

  return { history, result };
}
