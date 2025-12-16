import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createMemoryHistory } from 'history';
import { Route, Router, Switch } from 'react-router-dom';
import userEvent from '@testing-library/user-event';

import { ElectionInfo, TtsStringDefault } from '@votingworks/design-backend';
import { ElectionStringKey, LanguageCode } from '@votingworks/types';

import { createMockApiClient, provideApi } from '../test/api_helpers';
import { electionParamRoutes, routes } from './routes';
import { AudioEditorPanel } from './ballot_audio/audio_editor_panel';
import { render, screen, waitFor } from '../test/react_testing_library';
import { ElectionInfoAudioPanel } from './election_info_audio_panel';

vi.mock('./ballot_audio/audio_editor_panel', async (importActual) => ({
  ...(await importActual()),
  AudioEditorPanel: vi.fn(),
}));

const electionId = 'election-1';
const jurisdictionId = 'jurisdiction-1';

const electionInfoParamRoutes = electionParamRoutes.electionInfo;
const electionInfoRoutes = routes.election(electionId).electionInfo;

const Key = ElectionStringKey;

const MockAudioEditorPanel = vi.mocked(AudioEditorPanel);
const AUDIO_EDIT_PANEL_TEST_ID = 'MockAudioEditorPanel';

beforeEach(() => {
  MockAudioEditorPanel.mockImplementation((props) => {
    const { header } = props;
    return <div data-testid={AUDIO_EDIT_PANEL_TEST_ID}>{header}</div>;
  });
});

describe('valid string keys', () => {
  interface Spec {
    stringKey: ElectionStringKey;
    expectedEditor: {
      title: string | RegExp;
      ttsDefault: TtsStringDefault;
    };
  }

  const ttsDefaults: TtsStringDefault[] = [
    { key: Key.COUNTY_NAME, text: 'Countyville' },
    { key: Key.ELECTION_TITLE, text: 'General Election' },
    { key: Key.STATE_NAME, text: 'CA' },
  ];

  const specs: Spec[] = [
    {
      stringKey: Key.COUNTY_NAME,
      expectedEditor: {
        title: 'Election Info Audio: Jurisdiction',
        ttsDefault: ttsDefaults[0],
      },
    },

    {
      stringKey: Key.ELECTION_TITLE,
      expectedEditor: {
        title: 'Election Info Audio: Title',
        ttsDefault: ttsDefaults[1],
      },
    },

    {
      stringKey: Key.STATE_NAME,
      expectedEditor: {
        title: 'Election Info Audio: State',
        ttsDefault: ttsDefaults[2],
      },
    },
  ];

  for (const s of specs) {
    test(`renders for ${s.stringKey}`, async () => {
      const { history } = renderPanel(ttsDefaults, { stringKey: s.stringKey });

      await screen.findByRole('heading', { name: s.expectedEditor.title });
      expect(MockAudioEditorPanel.mock.lastCall?.[0]).toMatchObject({
        electionId,
        jurisdictionId,
        languageCode: LanguageCode.ENGLISH,
        ttsDefault: s.expectedEditor.ttsDefault,
      });

      userEvent.click(screen.getButton('Close'));
      expect(history.location.pathname).toEqual(electionInfoRoutes.root.path);
    });
  }
});

test('redirects to election info root for invalid string keys', async () => {
  const ttsDefaults: TtsStringDefault[] = [
    { key: Key.CONTEST_TITLE, text: 'Contest Title' },
  ];

  const { history } = renderPanel(ttsDefaults, {
    stringKey: Key.CONTEST_TITLE,
  });

  await waitFor(() => {
    expect(history.location.pathname).toEqual(electionInfoRoutes.root.path);
  });
  expect(
    screen.queryByRole('heading', { name: /Election Info Audio/ })
  ).not.toBeInTheDocument();
});

function renderPanel(
  ttsDefaults: TtsStringDefault[],
  ttsString: { stringKey: ElectionStringKey }
) {
  const history = createMemoryHistory({
    initialEntries: [electionInfoRoutes.audio({ ...ttsString })],
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
            path={electionInfoParamRoutes.audio({ stringKey: ':stringKey' })}
            component={ElectionInfoAudioPanel}
          />
          <Route exact path={electionInfoParamRoutes.root.path} />
        </Switch>
      </Router>
    )
  );

  mockApi.assertComplete();

  return { history, result };
}
