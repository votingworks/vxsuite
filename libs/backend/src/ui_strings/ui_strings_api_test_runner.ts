/* istanbul ignore file - test util */

import { LanguageCode, UiStringAudioClips } from '@votingworks/types';
import { UiStringsStore } from './ui_strings_store';
import { UiStringsApi } from './ui_strings_api';

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

    store.addLanguage(LanguageCode.CHINESE_TRADITIONAL);
    expect([...api.getAvailableLanguages()].sort()).toEqual(
      [LanguageCode.ENGLISH, LanguageCode.CHINESE_TRADITIONAL].sort()
    );
  });

  test('getUiStrings', () => {
    expect(api.getUiStrings({ languageCode: LanguageCode.ENGLISH })).toBeNull();
    expect(
      api.getUiStrings({ languageCode: LanguageCode.CHINESE_TRADITIONAL })
    ).toBeNull();
    expect(api.getUiStrings({ languageCode: LanguageCode.SPANISH })).toBeNull();

    store.setUiStrings({
      languageCode: LanguageCode.ENGLISH,
      data: { foo: 'bar' },
    });
    store.setUiStrings({
      languageCode: LanguageCode.CHINESE_TRADITIONAL,
      data: { foo: 'bar_zh' },
    });

    expect(api.getUiStrings({ languageCode: LanguageCode.ENGLISH })).toEqual({
      foo: 'bar',
    });
    expect(
      api.getUiStrings({ languageCode: LanguageCode.CHINESE_TRADITIONAL })
    ).toEqual({
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

    store.addLanguage(LanguageCode.CHINESE_TRADITIONAL);
    store.setUiStringAudioIds({
      languageCode: LanguageCode.CHINESE_TRADITIONAL,
      data: {
        foo: ['456', 'def'],
        deeply: { nested: ['654', 'fed'] },
      },
    });

    expect(
      api.getUiStringAudioIds({
        languageCode: LanguageCode.CHINESE_TRADITIONAL,
      })
    ).toEqual({
      foo: ['456', 'def'],
      deeply: { nested: ['654', 'fed'] },
    });

    expect(
      api.getUiStringAudioIds({ languageCode: LanguageCode.SPANISH })
    ).toBeNull();
  });

  test('getAudioClipsBase64', () => {
    store.addLanguage(LanguageCode.SPANISH);

    expect(
      api.getAudioClips({
        languageCode: LanguageCode.SPANISH,
        audioIds: ['es1'],
      })
    ).toEqual([]);

    const clips: UiStringAudioClips = [
      { dataBase64: 'ABC==', id: 'es1', languageCode: LanguageCode.SPANISH },
      { dataBase64: 'BAC==', id: 'es2', languageCode: LanguageCode.SPANISH },
      { dataBase64: 'CAB==', id: 'es3', languageCode: LanguageCode.SPANISH },
    ];
    for (const clip of clips) {
      store.setAudioClip(clip);
    }

    expect(
      api.getAudioClips({
        languageCode: LanguageCode.SPANISH,
        audioIds: ['es1', 'es3', 'missingClipId'],
      })
    ).toEqual([
      { dataBase64: 'ABC==', id: 'es1', languageCode: LanguageCode.SPANISH },
      { dataBase64: 'CAB==', id: 'es3', languageCode: LanguageCode.SPANISH },
    ]);
  });
}
