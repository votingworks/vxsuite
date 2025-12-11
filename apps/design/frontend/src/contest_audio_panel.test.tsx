import { beforeEach, expect, test, vi } from 'vitest';
import { createMemoryHistory } from 'history';
import { Route, Router, Switch } from 'react-router-dom';

import { ElectionInfo, TtsStringDefault } from '@votingworks/design-backend';
import { ElectionStringKey, LanguageCode } from '@votingworks/types';
import userEvent from '@testing-library/user-event';

import { createMockApiClient, provideApi } from '../test/api_helpers';
import { ContestAudioPanel } from './contest_audio_panel';
import { electionParamRoutes, routes } from './routes';
import { AudioEditorPanel } from './ballot_audio/audio_editor_panel';
import { render, screen, waitFor } from '../test/react_testing_library';

vi.mock('./ballot_audio/audio_editor_panel', async (importActual) => ({
  ...(await importActual()),
  AudioEditorPanel: vi.fn(),
}));

const contestId = 'contest-1';
const electionId = 'election-1';
const jurisdictionId = 'jurisdiction-1';

const contestParamRoutes = electionParamRoutes.contests;
const contestRoutes = routes.election(electionId).contests;

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
    stringKey: Key.CONTEST_TITLE,
    subkey: contestId,
    ttsDefaults: [
      { key: Key.CONTEST_TITLE, subkey: 'other-1', text: 'Other Contest' },
      { key: Key.CONTEST_TITLE, subkey: contestId, text: 'Contest Title' },
    ],

    expectedEditor: {
      title: 'Contest Audio: Title',
      ttsDefaultIndex: 1,
    },
  },

  {
    stringKey: Key.CONTEST_TERM,
    subkey: contestId,
    ttsDefaults: [
      { key: Key.CONTEST_TERM, subkey: 'other-1', text: '2 Years' },
      { key: Key.CONTEST_TERM, subkey: contestId, text: '4 Years' },
    ],

    expectedEditor: {
      title: 'Contest Audio: Term',
      ttsDefaultIndex: 1,
    },
  },

  {
    stringKey: Key.CONTEST_DESCRIPTION,
    subkey: contestId,
    ttsDefaults: [
      { key: Key.CONTEST_DESCRIPTION, subkey: 'other-1', text: 'Blue' },
      { key: Key.CONTEST_DESCRIPTION, subkey: contestId, text: 'Green' },
    ],

    expectedEditor: {
      title: 'Contest Audio: Description',
      ttsDefaultIndex: 1,
    },
  },

  {
    stringKey: Key.CANDIDATE_NAME,
    subkey: 'candidate-2',
    ttsDefaults: [
      { key: Key.CANDIDATE_NAME, subkey: 'candidate-1', text: 'Candidate 1' },
      { key: Key.CANDIDATE_NAME, subkey: 'candidate-2', text: 'Candidate 2' },
    ],

    expectedEditor: {
      title: 'Contest Audio: Candidate Name',
      ttsDefaultIndex: 1,
    },
  },

  {
    stringKey: Key.CONTEST_OPTION_LABEL,
    subkey: 'option-2',
    ttsDefaults: [
      { key: Key.CONTEST_OPTION_LABEL, subkey: 'option-1', text: 'Option 1' },
      { key: Key.CONTEST_OPTION_LABEL, subkey: 'option-2', text: 'Option 2' },
    ],

    expectedEditor: {
      title: 'Contest Audio: Option Label',
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

    userEvent.click(screen.getButton('Contest Info'));
    expect(history.location.pathname).toEqual(
      contestRoutes.view(contestId).path
    );
  });
}

test('redirects to contest view for unmatched strings', async () => {
  const ttsDefaults: TtsStringDefault[] = [
    { key: Key.CONTEST_TITLE, subkey: 'other-1', text: 'Other Contest' },
  ];

  const { history } = renderPanel(ttsDefaults, {
    stringKey: Key.CONTEST_TITLE,
    subkey: contestId,
  });

  await waitFor(() => {
    expect(history.location.pathname).toEqual(
      contestRoutes.view(contestId).path
    );
  });
  expect(
    screen.queryByRole('heading', { name: /Contest Audio/ })
  ).not.toBeInTheDocument();
});

test('redirects to contest view for invalid string keys', async () => {
  const ttsDefaults: TtsStringDefault[] = [
    { key: Key.CONTEST_TITLE, subkey: contestId, text: 'Contest Title' },
  ];

  const { history } = renderPanel(ttsDefaults, {
    stringKey: Key.PRECINCT_NAME,
    subkey: 'precinct-id',
  });

  await waitFor(() => {
    expect(history.location.pathname).toEqual(
      contestRoutes.view(contestId).path
    );
  });
  expect(
    screen.queryByRole('heading', { name: /Contest Audio/ })
  ).not.toBeInTheDocument();
});

function renderPanel(
  ttsDefaults: TtsStringDefault[],
  ttsString: { stringKey: ElectionStringKey; subkey: string }
) {
  const history = createMemoryHistory({
    initialEntries: [contestRoutes.audio({ ...ttsString, contestId })],
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
            path={contestParamRoutes.audio({
              contestId: ':contestId',
              stringKey: ':stringKey',
              subkey: ':subkey',
            })}
            component={ContestAudioPanel}
          />
          <Route exact path={contestParamRoutes.view(':contestId').path} />
        </Switch>
      </Router>
    )
  );

  mockApi.assertComplete();

  return { history, result };
}
