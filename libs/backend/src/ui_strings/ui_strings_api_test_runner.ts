/* istanbul ignore file - test util */

import { LanguageCode, UiStringsApi } from '@votingworks/types';
import { UiStringsStore } from './ui_strings_store';

/** Shared tests for the {@link UiStringsApi} and underlying store. */
export function runUiStringApiTests(params: {
  api: UiStringsApi;
  store: UiStringsStore;
}): void {
  const { api, store } = params;

  afterEach(() => {
    jest.resetAllMocks();
  });

  test('getAvailableLanguages', () => {
    expect(api.getAvailableLanguages()).toEqual([]);

    store.addLanguage(LanguageCode.ENGLISH);
    store.addLanguage(LanguageCode.ENGLISH); // Should be a no-op.
    expect(api.getAvailableLanguages()).toEqual([LanguageCode.ENGLISH]);

    store.addLanguage(LanguageCode.CHINESE);
    expect([...api.getAvailableLanguages()].sort()).toEqual(
      [LanguageCode.ENGLISH, LanguageCode.CHINESE].sort()
    );
  });

  test('getUiStrings throws not-yet-implemented error', () => {
    expect(() =>
      api.getUiStrings({ languageCode: LanguageCode.SPANISH })
    ).toThrow(/not yet implemented/i);
  });

  test('getUiStringAudioIds throws not-yet-implemented error', () => {
    expect(() =>
      api.getUiStringAudioIds({ languageCode: LanguageCode.CHINESE })
    ).toThrow(/not yet implemented/i);
  });

  test('getAudioClipsBase64 throws not-yet-implemented error', () => {
    expect(() =>
      api.getAudioClipsBase64({
        languageCode: LanguageCode.ENGLISH,
        audioIds: ['abc123', 'd1e2f3'],
      })
    ).toThrow(/not yet implemented/i);
  });
}
