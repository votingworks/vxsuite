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

  test('getUiStrings', () => {
    expect(api.getUiStrings({ languageCode: LanguageCode.ENGLISH })).toBeNull();
    expect(api.getUiStrings({ languageCode: LanguageCode.CHINESE })).toBeNull();
    expect(api.getUiStrings({ languageCode: LanguageCode.SPANISH })).toBeNull();

    store.setUiStrings({
      languageCode: LanguageCode.ENGLISH,
      data: { foo: 'bar' },
    });
    store.setUiStrings({
      languageCode: LanguageCode.CHINESE,
      data: { foo: 'bar_zh' },
    });

    expect(api.getUiStrings({ languageCode: LanguageCode.ENGLISH })).toEqual({
      foo: 'bar',
    });
    expect(api.getUiStrings({ languageCode: LanguageCode.CHINESE })).toEqual({
      foo: 'bar_zh',
    });
    expect(api.getUiStrings({ languageCode: LanguageCode.SPANISH })).toBeNull();
  });

  test('getUiStringAudioIds', () => {
    for (const languageCode of Object.values(LanguageCode)) {
      expect(api.getUiStringAudioIds({ languageCode })).toBeNull();
    }

    store.addLanguage(LanguageCode.ENGLISH);
    store.setUiStringAudioIds({
      languageCode: LanguageCode.ENGLISH,
      data: {
        foo: ['123', 'abc'],
        deeply: { nested: ['321', 'cba'] },
      },
    });

    expect(
      api.getUiStringAudioIds({ languageCode: LanguageCode.ENGLISH })
    ).toEqual({
      foo: ['123', 'abc'],
      deeply: { nested: ['321', 'cba'] },
    });

    store.addLanguage(LanguageCode.CHINESE);
    store.setUiStringAudioIds({
      languageCode: LanguageCode.CHINESE,
      data: {
        foo: ['456', 'def'],
        deeply: { nested: ['654', 'fed'] },
      },
    });

    expect(
      api.getUiStringAudioIds({ languageCode: LanguageCode.CHINESE })
    ).toEqual({
      foo: ['456', 'def'],
      deeply: { nested: ['654', 'fed'] },
    });

    expect(
      api.getUiStringAudioIds({ languageCode: LanguageCode.SPANISH })
    ).toBeNull();
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
