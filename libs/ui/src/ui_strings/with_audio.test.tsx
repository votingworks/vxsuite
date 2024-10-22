import { act } from 'react';

import { TestLanguageCode } from '@votingworks/test-utils';
import { UiStringAudioDataAttributeName, WithAudio } from './with_audio';
import {
  render as renderWithoutContext,
  screen,
  waitFor,
} from '../../test/react_testing_library';
import { newTestContext } from '../../test/test_context';
import { LanguageOverride } from './language_override';

const { ENGLISH, SPANISH } = TestLanguageCode;

function expectI18nKeyAttribute(element: HTMLElement, i18nKey: string) {
  expect(element).toHaveAttribute(
    UiStringAudioDataAttributeName.I18N_KEY,
    i18nKey
  );
}

function expectLanguageAttribute(element: HTMLElement, code: string) {
  expect(element).toHaveAttribute(
    UiStringAudioDataAttributeName.LANGUAGE_CODE,
    code
  );
}

test('omits data attributes if no audio context is available', () => {
  renderWithoutContext(
    <WithAudio i18nKey="contestTitle.contest1">Mayor</WithAudio>
  );

  const mayor = screen.getByText('Mayor');

  for (const attributeName of Object.values(UiStringAudioDataAttributeName)) {
    expect(mayor).not.toHaveAttribute(attributeName);
  }
});

test('uses language code from closest language context', async () => {
  const { render } = newTestContext();

  render(
    <div>
      <WithAudio i18nKey="contestTitle.contest1">Mayor</WithAudio>
      <LanguageOverride languageCode={SPANISH}>
        <WithAudio i18nKey="contestTitle.contest2">President</WithAudio>
      </LanguageOverride>
    </div>
  );

  const mayor = await screen.findByText('Mayor');
  expectI18nKeyAttribute(mayor, 'contestTitle.contest1');
  expectLanguageAttribute(mayor, ENGLISH);

  const president = screen.getByText('President');
  expectI18nKeyAttribute(president, 'contestTitle.contest2');
  expectLanguageAttribute(president, SPANISH);
});

test('pre-fetches audio clips when within audio context', async () => {
  const { getLanguageContext, mockApiClient, render } = newTestContext();

  mockApiClient.getUiStringAudioIds.mockImplementation((input) => {
    if (input.languageCode === SPANISH) {
      return Promise.resolve({
        contestTitle: {
          contest1: ['foo_es', 'bar_es'],
          contest2: ['ignore', 'me'],
        },
      });
    }

    return Promise.resolve({ contestTitle: { contest1: ['foo', 'bar'] } });
  });

  render(<WithAudio i18nKey="contestTitle.contest1">Mayor</WithAudio>);

  await screen.findByText('Mayor');

  act(() => getLanguageContext()?.setLanguage(SPANISH));

  await waitFor(() =>
    expect(mockApiClient.getAudioClips).toHaveBeenLastCalledWith({
      languageCode: 'es-US',
      audioIds: ['foo_es', 'bar_es'],
    })
  );
});

test('skips pre-fetch for missing audio ID mappings', async () => {
  const { mockApiClient, render } = newTestContext();

  mockApiClient.getUiStringAudioIds.mockResolvedValue({});

  render(<WithAudio i18nKey="contestTitle.contest1">Mayor</WithAudio>);

  await screen.findByText('Mayor');

  expect(mockApiClient.getAudioClips).not.toHaveBeenCalled();
});
