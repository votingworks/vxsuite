import { beforeEach, expect, test, vi } from 'vitest';
import { createMemoryHistory } from 'history';
import { Route, Router, Switch } from 'react-router-dom';

import { ElectionInfo, TtsStringDefault } from '@votingworks/design-backend';
import { ElectionStringKey, LanguageCode } from '@votingworks/types';
import userEvent from '@testing-library/user-event';

import { createMockApiClient, provideApi } from '../test/api_helpers';
import { PrecinctAudioPanel } from './precinct_audio_panel';
import { electionParamRoutes, routes } from './routes';
import { AudioEditorPanel } from './ballot_audio/audio_editor_panel';
import { render, screen, waitFor } from '../test/react_testing_library';

vi.mock('./ballot_audio/audio_editor_panel', async (importActual) => ({
  ...(await importActual()),
  AudioEditorPanel: vi.fn(),
}));

const electionId = 'election-1';
const jurisdictionId = 'jurisdiction-1';
const precinctId = 'precinct-1';
const splitId1 = 'split-1';
const splitId2 = 'split-2';

const precinctParamRoutes = electionParamRoutes.precincts;
const precinctRoutes = routes.election(electionId).precincts;

const Key = ElectionStringKey;

const MockAudioEditorPanel = vi.mocked(AudioEditorPanel);
const AUDIO_EDIT_PANEL_TEST_ID = 'MockAudioEditorPanel';

beforeEach(() => {
  MockAudioEditorPanel.mockImplementation((props) => {
    const { header } = props;
    return <div data-testid={AUDIO_EDIT_PANEL_TEST_ID}>{header}</div>;
  });
});

interface Spec {
  stringKey: ElectionStringKey;
  subkey: string;
  ttsDefaults: TtsStringDefault[];

  expectedEditor: {
    title: string | RegExp;
    ttsDefaultIndex: number;
  };
}

const specs: Spec[] = [
  {
    stringKey: Key.PRECINCT_NAME,
    subkey: precinctId,
    ttsDefaults: [
      { key: Key.PRECINCT_NAME, subkey: 'other-1', text: 'Other Precinct' },
      { key: Key.PRECINCT_NAME, subkey: precinctId, text: 'Precinct Name' },
    ],

    expectedEditor: {
      title: 'Precinct Audio: Name',
      ttsDefaultIndex: 1,
    },
  },

  {
    stringKey: Key.PRECINCT_SPLIT_NAME,
    subkey: splitId2,
    ttsDefaults: [
      { key: Key.PRECINCT_SPLIT_NAME, subkey: splitId1, text: 'Split 1' },
      { key: Key.PRECINCT_SPLIT_NAME, subkey: splitId2, text: 'Split 2' },
    ],

    expectedEditor: {
      title: 'Precinct Audio: Split Name',
      ttsDefaultIndex: 1,
    },
  },
];

for (const s of specs) {
  test(`renders for ${s.stringKey}`, async () => {
    const { history } = renderPanel(s.ttsDefaults, {
      stringKey: s.stringKey,
      subkey: s.subkey,
    });

    await screen.findByRole('heading', { name: s.expectedEditor.title });
    expect(MockAudioEditorPanel.mock.lastCall?.[0]).toMatchObject({
      electionId,
      jurisdictionId,
      languageCode: LanguageCode.ENGLISH,
      ttsDefault: s.ttsDefaults[s.expectedEditor.ttsDefaultIndex],
    });

    userEvent.click(screen.getButton('Precinct Info'));
    expect(history.location.pathname).toEqual(
      precinctRoutes.view(precinctId).path
    );
  });
}

test('redirects to precinct view for unmatched string subkeys', async () => {
  const ttsDefaults: TtsStringDefault[] = [
    { key: Key.PRECINCT_NAME, subkey: 'other-1', text: 'Other Precinct' },
  ];

  const { history } = renderPanel(ttsDefaults, {
    stringKey: Key.PRECINCT_NAME,
    subkey: precinctId,
  });

  await waitFor(() => {
    expect(history.location.pathname).toEqual(
      precinctRoutes.view(precinctId).path
    );
  });
  expect(
    screen.queryByRole('heading', { name: /Precinct Audio/ })
  ).not.toBeInTheDocument();
});

test('redirects to precinct view for invalid string keys', async () => {
  const ttsDefaults: TtsStringDefault[] = [
    { key: Key.CONTEST_TITLE, subkey: precinctId, text: 'Contest Title' },
  ];

  const { history } = renderPanel(ttsDefaults, {
    stringKey: Key.CONTEST_TITLE,
    subkey: 'contest-1',
  });

  await waitFor(() => {
    expect(history.location.pathname).toEqual(
      precinctRoutes.view(precinctId).path
    );
  });
  expect(
    screen.queryByRole('heading', { name: /Precinct Audio/ })
  ).not.toBeInTheDocument();
});

function renderPanel(
  ttsDefaults: TtsStringDefault[],
  ttsString: { stringKey: ElectionStringKey; subkey: string }
) {
  const history = createMemoryHistory({
    initialEntries: [precinctRoutes.audio({ ...ttsString, precinctId })],
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
            path={precinctParamRoutes.audio({
              precinctId: ':precinctId',
              stringKey: ':stringKey',
              subkey: ':subkey',
            })}
            component={PrecinctAudioPanel}
          />
          <Route exact path={precinctParamRoutes.view(':precinctId').path} />
        </Switch>
      </Router>
    )
  );

  mockApi.assertComplete();

  return { history, result };
}
