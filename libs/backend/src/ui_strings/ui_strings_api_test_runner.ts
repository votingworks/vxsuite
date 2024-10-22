/* istanbul ignore file - test util */

import { UiStringAudioClips } from '@votingworks/types';
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

    store.addLanguage('en');
    store.addLanguage('en'); // Should be a no-op.
    expect(api.getAvailableLanguages()).toEqual(['en']);

    store.addLanguage('zh-Hant');
    expect([...api.getAvailableLanguages()].sort()).toEqual(
      ['en', 'zh-Hant'].sort()
    );
  });

  test('getUiStrings', () => {
    expect(api.getUiStrings({ languageCode: 'en' })).toBeNull();
    expect(api.getUiStrings({ languageCode: 'zh-Hant' })).toBeNull();
    expect(api.getUiStrings({ languageCode: 'es-US' })).toBeNull();

    store.setUiStrings({
      languageCode: 'en',
      data: { foo: 'bar' },
    });
    store.setUiStrings({
      languageCode: 'zh-Hant',
      data: { foo: 'bar_zh' },
    });

    expect(api.getUiStrings({ languageCode: 'en' })).toEqual({
      foo: 'bar',
    });
    expect(api.getUiStrings({ languageCode: 'zh-Hant' })).toEqual({
      foo: 'bar_zh',
    });
    expect(api.getUiStrings({ languageCode: 'es-US' })).toBeNull();
  });

  test('getUiStringAudioIds', () => {
    for (const languageCode of ['en', 'zh-Hant']) {
      expect(api.getUiStringAudioIds({ languageCode })).toBeNull();
    }

    store.addLanguage('en');
    store.setUiStringAudioIds({
      languageCode: 'en',
      data: {
        foo: ['123', 'abc'],
        deeply: { nested: ['321', 'cba'] },
      },
    });

    expect(api.getUiStringAudioIds({ languageCode: 'en' })).toEqual({
      foo: ['123', 'abc'],
      deeply: { nested: ['321', 'cba'] },
    });

    store.addLanguage('zh-Hant');
    store.setUiStringAudioIds({
      languageCode: 'zh-Hant',
      data: {
        foo: ['456', 'def'],
        deeply: { nested: ['654', 'fed'] },
      },
    });

    expect(
      api.getUiStringAudioIds({
        languageCode: 'zh-Hant',
      })
    ).toEqual({
      foo: ['456', 'def'],
      deeply: { nested: ['654', 'fed'] },
    });

    expect(api.getUiStringAudioIds({ languageCode: 'es-US' })).toBeNull();
  });

  test('getAudioClipsBase64', () => {
    store.addLanguage('es-US');

    expect(
      api.getAudioClips({
        languageCode: 'es-US',
        audioIds: ['es1'],
      })
    ).toEqual([]);

    const clips: UiStringAudioClips = [
      { dataBase64: 'ABC==', id: 'es1', languageCode: 'es-US' },
      { dataBase64: 'BAC==', id: 'es2', languageCode: 'es-US' },
      { dataBase64: 'CAB==', id: 'es3', languageCode: 'es-US' },
    ];
    for (const clip of clips) {
      store.setAudioClip(clip);
    }

    expect(
      api.getAudioClips({
        languageCode: 'es-US',
        audioIds: ['es1', 'es3', 'missingClipId'],
      })
    ).toEqual([
      { dataBase64: 'ABC==', id: 'es1', languageCode: 'es-US' },
      { dataBase64: 'CAB==', id: 'es3', languageCode: 'es-US' },
    ]);
  });
}
