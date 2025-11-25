import { expect, test, vi } from 'vitest';
import userEvent from '@testing-library/user-event';

import { TtsStringDefault } from '@votingworks/design-backend';
import { ElectionStringKey } from '@votingworks/types';

import { TtsTextEditor, TtsTextEditorProps } from './tts_text_editor';
import {
  createMockApiClient,
  MockApiClient,
  provideApi,
} from '../../test/api_helpers';
import { render, screen } from '../../test/react_testing_library';
import { AudioEditor, AudioEditorProps } from './audio_editor';

vi.mock('./tts_text_editor.js');

const TEXT_EDITOR_TEST_ID = 'TtsTextEditor';
const PHONETIC_EDITOR_PLACEHOLDER = 'TODO: Phonetic Editor';

const orgId = 'org-1';
const languageCode = 'en';

test('defaults to plain text editor if no saved edits exist', async () => {
  const ttsDefault: TtsStringDefault = {
    key: ElectionStringKey.STATE_NAME,
    text: 'CA',
  };

  const mockApi = createMockApiClient();
  mockApi.ttsEditsGet
    .expectCallWith({ orgId, languageCode, original: ttsDefault.text })
    .resolves(null);

  setUpTextEditorMock({ languageCode, orgId, original: ttsDefault.text });

  renderEditor(mockApi, {
    languageCode,
    orgId,
    ttsDefault,
    phoneticEnabled: true,
  });

  await screen.findByTestId(TEXT_EDITOR_TEST_ID);
  mockApi.assertComplete();
});

test('picks initial editor based on saved edits', async () => {
  const ttsDefault: TtsStringDefault = {
    key: ElectionStringKey.STATE_NAME,
    text: 'CA',
  };

  const mockApi = createMockApiClient();
  mockApi.ttsEditsGet
    .expectCallWith({ orgId, languageCode, original: ttsDefault.text })
    .resolves({ exportSource: 'phonetic', phonetic: [], text: 'CA' });

  setUpTextEditorMock({ languageCode, orgId, original: ttsDefault.text });

  renderEditor(mockApi, {
    languageCode,
    orgId,
    ttsDefault,
    phoneticEnabled: true,
  });

  await screen.findByText(PHONETIC_EDITOR_PLACEHOLDER);
  expect(screen.queryByTestId(TEXT_EDITOR_TEST_ID)).not.toBeInTheDocument();
  mockApi.assertComplete();
});

test('supports switching between text and phonetic editing', async () => {
  const ttsDefault: TtsStringDefault = {
    key: ElectionStringKey.STATE_NAME,
    text: 'CA',
  };

  const mockApi = createMockApiClient();
  mockApi.ttsEditsGet
    .expectCallWith({ orgId, languageCode, original: ttsDefault.text })
    .resolves({ exportSource: 'phonetic', phonetic: [], text: 'CA' });

  setUpTextEditorMock({ languageCode, orgId, original: ttsDefault.text });

  renderEditor(mockApi, {
    languageCode,
    orgId,
    ttsDefault,
    phoneticEnabled: true,
  });

  // Start with phonetic:
  await screen.findByText(PHONETIC_EDITOR_PLACEHOLDER);
  mockApi.assertComplete();

  // Switch to text:
  userEvent.click(screen.getButton('Text-To-Speech'));
  screen.getByTestId(TEXT_EDITOR_TEST_ID);
  expect(
    screen.queryByText(PHONETIC_EDITOR_PLACEHOLDER)
  ).not.toBeInTheDocument();

  // Switch back to phonetic:
  userEvent.click(screen.getButton('Phonetic'));
  screen.getByText(PHONETIC_EDITOR_PLACEHOLDER);
  expect(screen.queryByTestId(TEXT_EDITOR_TEST_ID)).not.toBeInTheDocument();
});

test('only supports text editing for contest descriptions', async () => {
  const ttsDefault: TtsStringDefault = {
    key: ElectionStringKey.CONTEST_DESCRIPTION,
    subkey: 'contest-1',
    text: 'Do you agree?',
  };

  const mockApi = createMockApiClient();
  mockApi.ttsEditsGet
    .expectCallWith({ orgId, languageCode, original: ttsDefault.text })
    .resolves(null);

  setUpTextEditorMock({ languageCode, orgId, original: ttsDefault.text });

  renderEditor(mockApi, {
    languageCode,
    orgId,
    ttsDefault,
    phoneticEnabled: true,
  });

  await screen.findByTestId(TEXT_EDITOR_TEST_ID);
  screen.getButton('Text-To-Speech');
  expect(screen.queryButton('Phonetic')).not.toBeInTheDocument();
});

test('omits phonetic editor when not enabled', async () => {
  const ttsDefault: TtsStringDefault = {
    key: ElectionStringKey.CONTEST_DESCRIPTION,
    subkey: 'contest-1',
    text: 'Do you agree?',
  };

  const mockApi = createMockApiClient();
  mockApi.ttsEditsGet
    .expectCallWith({ orgId, languageCode, original: ttsDefault.text })
    .resolves(null);

  setUpTextEditorMock({ languageCode, orgId, original: ttsDefault.text });

  // `phoneticEnabled` should be `false` by default:
  renderEditor(mockApi, { languageCode, orgId, ttsDefault });

  await screen.findByTestId(TEXT_EDITOR_TEST_ID);
  screen.getButton('Text-To-Speech');
  expect(screen.queryButton('Phonetic')).not.toBeInTheDocument();
});

function renderEditor(mockApi: MockApiClient, props: AudioEditorProps) {
  return render(provideApi(mockApi, <AudioEditor {...props} />));
}

function setUpTextEditorMock(expectedProps: TtsTextEditorProps) {
  vi.mocked(TtsTextEditor).mockImplementation((props) => {
    expect(props).toEqual(expectedProps);

    return <div data-testid={TEXT_EDITOR_TEST_ID} />;
  });
}
