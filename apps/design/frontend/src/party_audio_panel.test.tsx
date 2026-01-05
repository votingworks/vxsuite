import { beforeEach, expect, test, vi } from 'vitest';
import { createMemoryHistory } from 'history';
import { Route, Router, Switch } from 'react-router-dom';

import { ElectionInfo, TtsStringDefault } from '@votingworks/design-backend';
import { ElectionStringKey, LanguageCode } from '@votingworks/types';
import userEvent from '@testing-library/user-event';

import { createMockApiClient, provideApi } from '../test/api_helpers';
import { PartyAudioPanel } from './party_audio_panel';
import { electionParamRoutes, routes } from './routes';
import { AudioEditorPanel } from './ballot_audio/audio_editor_panel';
import { render, screen, waitFor } from '../test/react_testing_library';

vi.mock('./ballot_audio/audio_editor_panel', async (importActual) => ({
  ...(await importActual()),
  AudioEditorPanel: vi.fn(),
}));

const electionId = 'election-1';
const jurisdictionId = 'jurisdiction-1';
const partyId = 'party-1';

const partyParamRoutes = electionParamRoutes.parties;
const partyRoutes = routes.election(electionId).parties;

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
    stringKey: Key.PARTY_FULL_NAME,
    subkey: partyId,
    ttsDefaults: [
      { key: Key.PARTY_FULL_NAME, subkey: 'dinner-1', text: 'Dinner Party' },
      { key: Key.PARTY_FULL_NAME, subkey: partyId, text: 'Graduation Party' },
    ],

    expectedEditor: {
      title: 'Party Audio: Full Name',
      ttsDefaultIndex: 1,
    },
  },

  {
    stringKey: Key.PARTY_NAME,
    subkey: partyId,
    ttsDefaults: [
      { key: Key.PARTY_NAME, subkey: 'dinner-1', text: 'Dinner' },
      { key: Key.PARTY_NAME, subkey: partyId, text: 'Graduation' },
    ],

    expectedEditor: {
      title: 'Party Audio: Short Name',
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

    userEvent.click(screen.getButton('Close'));
    expect(history.location.pathname).toEqual(partyRoutes.root.path);
  });
}

test('redirects to party view for unmatched string subkeys', async () => {
  const ttsDefaults: TtsStringDefault[] = [
    { key: Key.PARTY_NAME, subkey: 'other-1', text: 'Other Party' },
  ];

  const { history } = renderPanel(ttsDefaults, {
    stringKey: Key.PARTY_NAME,
    subkey: partyId,
  });

  await waitFor(() => {
    expect(history.location.pathname).toEqual(partyRoutes.root.path);
  });
  expect(
    screen.queryByRole('heading', { name: /Party Audio/ })
  ).not.toBeInTheDocument();
});

test('redirects to party view for invalid string keys', async () => {
  const ttsDefaults: TtsStringDefault[] = [
    { key: Key.CONTEST_TITLE, subkey: partyId, text: 'Contest Title' },
  ];

  const { history } = renderPanel(ttsDefaults, {
    stringKey: Key.CONTEST_TITLE,
    subkey: partyId,
  });

  await waitFor(() => {
    expect(history.location.pathname).toEqual(partyRoutes.root.path);
  });
  expect(
    screen.queryByRole('heading', { name: /Party Audio/ })
  ).not.toBeInTheDocument();
});

function renderPanel(
  ttsDefaults: TtsStringDefault[],
  ttsString: { stringKey: ElectionStringKey; subkey: string }
) {
  const history = createMemoryHistory({
    initialEntries: [partyRoutes.audio({ ...ttsString })],
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
            path={partyParamRoutes.audio({
              stringKey: ':stringKey',
              subkey: ':subkey',
            })}
            component={PartyAudioPanel}
          />
          <Route exact path={partyParamRoutes.root.path} />
        </Switch>
      </Router>
    )
  );

  mockApi.assertComplete();

  return { history, result };
}
