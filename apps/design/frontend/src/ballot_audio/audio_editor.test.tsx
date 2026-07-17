import { expect, test, vi } from 'vitest';
import userEvent from '@testing-library/user-event';

import { TtsStringDefault } from '@votingworks/design-backend';
import { ElectionStringKey, LanguageCode } from '@votingworks/types';

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
const PHONETIC_EDITOR_CONTENT = /pick a word below/i;

const jurisdictionId = 'jurisdiction-1';
const electionId = 'election-1';
const languageCode = LanguageCode.ENGLISH;

test('defaults to plain text editor if no saved edits exist', async () => {
  const ttsDefault: TtsStringDefault = {
    key: ElectionStringKey.STATE_NAME,
    text: 'CA',
  };

  const mockApi = createMockApiClient();
  mockApi.ttsEditsGet
    .expectCallWith({ jurisdictionId, languageCode, original: ttsDefault.text })
    .resolves(null);

  mockApi.getBallotsFinalizedAt.expectCallWith({ electionId }).resolves(null);

  setUpTextEditorMock({
    editable: true,
    languageCode,
    jurisdictionId,
    original: ttsDefault.text,
  });

  renderEditor(mockApi, {
    electionId,
    languageCode,
    jurisdictionId,
    ttsDefault,
  });

  await screen.findByTestId(TEXT_EDITOR_TEST_ID);
  mockApi.assertComplete();
});

test.skip('picks initial editor based on saved edits', async () => {
  const ttsDefault: TtsStringDefault = {
    key: ElectionStringKey.STATE_NAME,
    text: 'CA',
  };

  const mockApi = createMockApiClient();
  mockApi.ttsEditsGet
    .expectCallWith({ jurisdictionId, languageCode, original: ttsDefault.text })
    .resolves({
      exportSource: 'phonetic',
      phonetic: [],
      recordingDataUrl: '',
      text: 'CA',
    });

  mockApi.getBallotsFinalizedAt.expectCallWith({ electionId }).resolves(null);

  setUpTextEditorMock({
    editable: true,
    languageCode,
    jurisdictionId,
    original: ttsDefault.text,
  });

  renderEditor(mockApi, {
    electionId,
    languageCode,
    jurisdictionId,
    ttsDefault,
  });

  await screen.findByText(PHONETIC_EDITOR_CONTENT);
  expect(screen.queryByTestId(TEXT_EDITOR_TEST_ID)).not.toBeInTheDocument();
  mockApi.assertComplete();
});

test.skip('supports switching between text and phonetic editing', async () => {
  const ttsDefault: TtsStringDefault = {
    key: ElectionStringKey.STATE_NAME,
    text: 'CA',
  };

  const mockApi = createMockApiClient();
  mockApi.ttsEditsGet
    .expectCallWith({ jurisdictionId, languageCode, original: ttsDefault.text })
    .resolves({
      exportSource: 'phonetic',
      phonetic: [],
      recordingDataUrl: '',
      text: 'CA',
    });

  mockApi.getBallotsFinalizedAt.expectCallWith({ electionId }).resolves(null);

  setUpTextEditorMock({
    editable: true,
    languageCode,
    jurisdictionId,
    original: ttsDefault.text,
  });

  renderEditor(mockApi, {
    electionId,
    languageCode,
    jurisdictionId,
    ttsDefault,
  });

  // Start with phonetic:
  await screen.findByText(PHONETIC_EDITOR_CONTENT);
  mockApi.assertComplete();

  // Switch to text:
  userEvent.click(screen.getButton('Text-To-Speech'));
  screen.getByTestId(TEXT_EDITOR_TEST_ID);
  expect(screen.queryByText(PHONETIC_EDITOR_CONTENT)).not.toBeInTheDocument();

  // Switch back to phonetic:
  userEvent.click(screen.getButton('Phonetic'));
  screen.getByText(PHONETIC_EDITOR_CONTENT);
  expect(screen.queryByTestId(TEXT_EDITOR_TEST_ID)).not.toBeInTheDocument();
});

test('text mode - not editable after ballots are finalized', async () => {
  const ttsDefault: TtsStringDefault = {
    key: ElectionStringKey.STATE_NAME,
    text: 'CA',
  };

  const mockApi = createMockApiClient();
  mockApi.ttsEditsGet
    .expectCallWith({ jurisdictionId, languageCode, original: ttsDefault.text })
    .resolves(null);

  const now = new Date();
  mockApi.getBallotsFinalizedAt.expectCallWith({ electionId }).resolves(now);

  setUpTextEditorMock({
    editable: false,
    languageCode,
    jurisdictionId,
    original: ttsDefault.text,
  });

  renderEditor(mockApi, {
    electionId,
    languageCode,
    jurisdictionId,
    ttsDefault,
  });

  await screen.findByTestId(TEXT_EDITOR_TEST_ID);
  mockApi.assertComplete();

  expect(screen.getButton('Text-To-Speech')).toBeDisabled();
  expect(screen.getButton('Phonetic')).toBeDisabled();
});

test.skip('phonetic mode - not editable after ballots are finalized', async () => {
  const ttsDefault: TtsStringDefault = {
    key: ElectionStringKey.STATE_NAME,
    text: 'CA',
  };

  const mockApi = createMockApiClient();
  mockApi.ttsEditsGet
    .expectCallWith({ jurisdictionId, languageCode, original: ttsDefault.text })
    .resolves({
      exportSource: 'phonetic',
      phonetic: [],
      recordingDataUrl: '',
      text: 'CA',
    });

  const now = new Date();
  mockApi.getBallotsFinalizedAt.expectCallWith({ electionId }).resolves(now);

  renderEditor(mockApi, {
    electionId,
    languageCode,
    jurisdictionId,
    ttsDefault,
  });

  await screen.findByText(PHONETIC_EDITOR_CONTENT);
  mockApi.assertComplete();

  expect(screen.getButton('Text-To-Speech')).toBeDisabled();
  expect(screen.getButton('Phonetic')).toBeDisabled();

  // [TODO] Assert phonetic editor is non-editable.
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
