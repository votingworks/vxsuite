import React from 'react';
import { expect, test } from 'vitest';

import userEvent from '@testing-library/user-event';
import { deferred, sleep } from '@votingworks/basics';
import { TtsEdit } from '@votingworks/types';

import { act, render, screen, waitFor } from '../../test/react_testing_library';
import { TtsTextEditor } from './tts_text_editor';
import {
  createMockApiClient,
  MockApiClient,
  provideApi,
} from '../../test/api_helpers';

const orgId = 'org-1';
const languageCode = 'en';

test('renders TTS defaults if no edits exist', async () => {
  const original = 'CA';
  const mockAudio = 'audioData';

  const mockApi = createMockApiClient();
  mockApi.ttsEditsGet
    .expectCallWith({ orgId, languageCode, original })
    .resolves(null);

  mockApi.ttsSynthesizeFromText
    .expectCallWith({ languageCode, text: original })
    .resolves(mockAudio);

  const { container } = renderEditor(
    mockApi,
    <TtsTextEditor
      languageCode={languageCode}
      orgId={orgId}
      original={original}
    />
  );

  await screen.findByText(/edit the text below/i);
  mockApi.assertComplete();

  expect(screen.getByRole('textbox')).toHaveValue('CA');
  expectAudioPlayerData(container, mockAudio);
});

test('renders saved edits if available', async () => {
  const original = 'CA';
  const savedEdit: TtsEdit = {
    exportSource: 'text',
    phonetic: [],
    text: 'California',
  };

  const mockApi = createMockApiClient();
  mockApi.ttsEditsGet
    .expectCallWith({ orgId, languageCode, original })
    .resolves(savedEdit);

  const mockAudio = 'audioData';
  mockApi.ttsSynthesizeFromText
    .expectCallWith({ languageCode, text: savedEdit.text })
    .resolves(mockAudio);

  const { container } = renderEditor(
    mockApi,
    <TtsTextEditor
      languageCode={languageCode}
      orgId={orgId}
      original={original}
    />
  );

  await screen.findByText(/edit the text below/i);
  mockApi.assertComplete();

  expect(screen.getByRole('textbox')).toHaveValue('California');
  expectAudioPlayerData(container, mockAudio);
});

test('enables save and reset button when applicable', async () => {
  const mockApi = createMockApiClient();
  mockApi.ttsEditsGet
    .expectCallWith({ orgId, languageCode, original: 'CA' })
    .resolves(null);

  mockApi.ttsSynthesizeFromText
    .expectCallWith({ languageCode, text: 'CA' })
    .resolves('audioData');

  renderEditor(
    mockApi,
    <TtsTextEditor languageCode={languageCode} orgId={orgId} original="CA" />
  );

  await screen.findByText(/edit the text below/i);
  mockApi.assertComplete();

  expect(screen.getByRole('textbox')).toHaveValue('CA');
  expect(screen.getButton(/save/i)).toBeDisabled();
  expect(screen.getButton(/reset/i)).toBeDisabled();

  userEvent.type(screen.getByRole('textbox'), 'li');
  expect(screen.getByRole('textbox')).toHaveValue('CAli');
  expect(screen.getButton(/save/i)).toBeEnabled();
  expect(screen.getButton(/reset/i)).toBeEnabled();

  userEvent.clear(screen.getByRole('textbox'));
  expect(screen.getByRole('textbox')).toHaveValue('');
  expect(screen.getButton(/save/i)).toBeDisabled();
  expect(screen.getButton(/reset/i)).toBeEnabled();
});

test('reset button restores saved state', async () => {
  const original = 'CA';
  const savedEdit: TtsEdit = {
    exportSource: 'text',
    phonetic: [],
    text: 'California',
  };

  const mockApi = createMockApiClient();
  mockApi.ttsEditsGet
    .expectCallWith({ orgId, languageCode, original })
    .resolves(savedEdit);

  mockApi.ttsSynthesizeFromText
    .expectCallWith({ languageCode, text: savedEdit.text })
    .resolves('audioData');

  renderEditor(
    mockApi,
    <TtsTextEditor
      languageCode={languageCode}
      orgId={orgId}
      original={original}
    />
  );

  await screen.findByText(/edit the text below/i);
  mockApi.assertComplete();

  expect(screen.getByRole('textbox')).toHaveValue('California');

  userEvent.clear(screen.getByRole('textbox'));
  userEvent.type(screen.getByRole('textbox'), 'CA');
  expect(screen.getByRole('textbox')).toHaveValue('CA');

  userEvent.click(screen.getButton(/reset/i));
  expect(screen.getByRole('textbox')).toHaveValue('California');
});

test('save button updates backend data, refreshes content', async () => {
  const original = 'CA';

  const mockApi = createMockApiClient();
  mockApi.ttsEditsGet
    .expectCallWith({ orgId, languageCode, original })
    .resolves(null);

  mockApi.ttsSynthesizeFromText
    .expectCallWith({ languageCode, text: original })
    .resolves('audioData');

  const { container } = renderEditor(
    mockApi,
    <TtsTextEditor
      languageCode={languageCode}
      orgId={orgId}
      original={original}
    />
  );

  await screen.findByText(/edit the text below/i);
  mockApi.assertComplete();

  expect(screen.getByRole('textbox')).toHaveValue('CA');
  userEvent.clear(screen.getByRole('textbox'));
  userEvent.type(screen.getByRole('textbox'), '  California  ');

  const expectedEdit: TtsEdit = {
    exportSource: 'text',
    phonetic: [],
    text: 'California',
  };

  //
  // Expect mutation API call on submit:
  //

  const deferredSet = deferred<void>();
  mockApi.ttsEditsSet
    .expectCallWith({ data: expectedEdit, languageCode, original, orgId })
    .returns(deferredSet.promise);

  userEvent.click(screen.getButton(/save/i));
  await sleep(0);
  expect(screen.getByRole('textbox')).toBeDisabled();
  expect(screen.getButton(/saving/i)).toBeDisabled();
  expect(screen.getButton(/reset/i)).toBeDisabled();

  mockApi.assertComplete();

  //
  // Expect data re-fetch after successful save:
  //

  mockApi.ttsEditsGet
    .expectCallWith({ orgId, languageCode, original })
    .resolves(expectedEdit);

  const newAudioData = 'newAudioDta';
  mockApi.ttsSynthesizeFromText
    .expectCallWith({ languageCode, text: expectedEdit.text })
    .resolves(newAudioData);

  act(deferredSet.resolve);
  await waitFor(() => expectAudioPlayerData(container, newAudioData));
  expect(screen.getByRole('textbox')).toHaveValue('California');
  expect(screen.getByRole('textbox')).toBeEnabled();
  expect(screen.getButton(/save/i)).toBeDisabled();
  expect(screen.getButton(/reset/i)).toBeDisabled();

  mockApi.assertComplete();
});

function expectAudioPlayerData(container: HTMLElement, data: string) {
  const results = container.getElementsByTagName('audio');
  expect(results).toHaveLength(1);
  expect(results.item(0)).toHaveAttribute('src', data);
}

function renderEditor(mockApi: MockApiClient, ui: React.ReactNode) {
  return render(provideApi(mockApi, ui));
}
