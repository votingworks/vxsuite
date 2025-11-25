import { expect, test, vi } from 'vitest';

import { TtsStringDefault } from '@votingworks/design-backend';
import {
  AnyContest,
  ElectionStringKey,
  YesNoContest,
} from '@votingworks/types';

import { AudioEditor, AudioEditorProps } from './audio_editor';
import {
  createMockApiClient,
  MockApiClient,
  provideApi,
} from '../../test/api_helpers';
import { AudioEditorPanel, AudioEditorPanelProps } from './audio_editor_panel';
import { render, screen } from '../../test/react_testing_library';

vi.mock('./audio_editor.js');

const EDITOR_TEST_ID = 'TtsTextEditor';

const electionId = 'election-1';
const orgId = 'org-1';
const languageCode = 'en';

test('renders editor, along with a preview of the original text', () => {
  const ttsDefault: TtsStringDefault = {
    key: ElectionStringKey.STATE_NAME,
    text: 'CA',
  };

  const mockApi = createMockApiClient();
  setUpEditorMock({ languageCode, orgId, ttsDefault });

  const header = <h1>Election Audio: State</h1>;

  renderPanel(mockApi, { electionId, header, languageCode, orgId, ttsDefault });

  mockApi.assertComplete();
  screen.getByRole('heading', { name: 'Election Audio: State' });
  screen.getByText('CA');
  screen.getByTestId(EDITOR_TEST_ID);
});

test('renders contest descriptions using original, unstripped HTML', async () => {
  const mockContest: Partial<YesNoContest> = {
    id: 'contest-1',
    description: '<p data-testid="preview">Do you agree?<p>',
    type: 'yesno',
  };

  const mockApi = createMockApiClient();
  mockApi.listContests
    .expectCallWith({ electionId })
    .resolves([mockContest as AnyContest]);

  const ttsDefault: TtsStringDefault = {
    key: ElectionStringKey.CONTEST_DESCRIPTION,
    subkey: mockContest.id,
    text: 'Do you agree?',
  };
  setUpEditorMock({ languageCode, orgId, ttsDefault });

  renderPanel(mockApi, {
    electionId,
    header: null,
    languageCode,
    orgId,
    ttsDefault,
  });

  expect(await screen.findByTestId('preview')).toHaveTextContent(
    'Do you agree?'
  );
  mockApi.assertComplete();
  screen.getByTestId(EDITOR_TEST_ID);
});

function renderPanel(mockApi: MockApiClient, props: AudioEditorPanelProps) {
  return render(provideApi(mockApi, <AudioEditorPanel {...props} />));
}

function setUpEditorMock(expectedProps: AudioEditorProps) {
  vi.mocked(AudioEditor).mockImplementation((props) => {
    expect(props).toEqual(expectedProps);

    return <div data-testid={EDITOR_TEST_ID} />;
  });
}
