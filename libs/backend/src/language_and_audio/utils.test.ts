import { expect, test } from 'vitest';
import {
  UiStringAudioIdsPackage,
  UiStringsPackage,
  LanguageCode,
} from '@votingworks/types';
import {
  forEachUiString,
  prepareTextForSpeechSynthesis,
  setUiString,
  setUiStringAudioIds,
} from './utils';

test.each<{
  languageCode: LanguageCode;
  text: string;
  expectedOutput: { audioId: string; text: string };
}>([
  {
    languageCode: LanguageCode.ENGLISH,
    text: 'Would you rather have 2 <1>apple pies</1> or 3 <3>key lime pies</3>?',
    expectedOutput: {
      audioId: '837829d72c',
      text: 'Would you rather have 2 apple pies or 3 key lime pies?',
    },
  },
  {
    languageCode: LanguageCode.ENGLISH,
    text: '1234',
    expectedOutput: {
      audioId: 'af14c6060f',
      text: '1234',
    },
  },
  {
    languageCode: LanguageCode.SPANISH,
    text: '1234',
    expectedOutput: {
      audioId: '695752ff7c',
      text: '1234',
    },
  },
])(
  'prepareTextForSpeechSynthesis - $text in $languageCode',
  ({ languageCode, text, expectedOutput }) => {
    expect(prepareTextForSpeechSynthesis(languageCode, text)).toEqual(
      expectedOutput
    );
  }
);

test('setUiString', () => {
  const uiStrings: UiStringsPackage = {};

  setUiString(uiStrings, LanguageCode.ENGLISH, 'A', 'One');
  setUiString(uiStrings, LanguageCode.ENGLISH, ['B', 'C'], 'Two');
  setUiString(uiStrings, LanguageCode.ENGLISH, ['B', 'D'], 'Three');
  setUiString(uiStrings, LanguageCode.SPANISH, 'A', 'Uno');
  setUiString(uiStrings, LanguageCode.SPANISH, ['B', 'C'], 'Dos');
  setUiString(uiStrings, LanguageCode.SPANISH, ['B', 'D'], 'Tres');

  expect(uiStrings).toEqual({
    [LanguageCode.ENGLISH]: {
      A: 'One',
      B: {
        C: 'Two',
        D: 'Three',
      },
    },
    [LanguageCode.SPANISH]: {
      A: 'Uno',
      B: {
        C: 'Dos',
        D: 'Tres',
      },
    },
  });
});

test('setUiStringAudioIds', () => {
  const uiStringAudioIds: UiStringAudioIdsPackage = {};

  setUiStringAudioIds(uiStringAudioIds, LanguageCode.ENGLISH, 'A', ['ab']);
  setUiStringAudioIds(
    uiStringAudioIds,
    LanguageCode.ENGLISH,
    ['B', 'C'],
    ['cd']
  );
  setUiStringAudioIds(
    uiStringAudioIds,
    LanguageCode.ENGLISH,
    ['B', 'D'],
    ['ef', 'gh']
  );
  setUiStringAudioIds(uiStringAudioIds, LanguageCode.SPANISH, 'A', ['ij']);
  setUiStringAudioIds(
    uiStringAudioIds,
    LanguageCode.SPANISH,
    ['B', 'C'],
    ['kl']
  );
  setUiStringAudioIds(
    uiStringAudioIds,
    LanguageCode.SPANISH,
    ['B', 'D'],
    ['mn', 'op']
  );

  expect(uiStringAudioIds).toEqual({
    [LanguageCode.ENGLISH]: {
      A: ['ab'],
      B: {
        C: ['cd'],
        D: ['ef', 'gh'],
      },
    },
    [LanguageCode.SPANISH]: {
      A: ['ij'],
      B: {
        C: ['kl'],
        D: ['mn', 'op'],
      },
    },
  });
});

test('forEachUiString', () => {
  const uiStrings: UiStringsPackage = {
    [LanguageCode.ENGLISH]: {
      A: 'One',
      B: {
        C: 'Two',
        D: 'Three',
      },
    },
    [LanguageCode.SPANISH]: {
      A: 'Uno',
      B: {
        C: 'Dos',
        D: 'Tres',
      },
    },
  };

  const entries: Array<{
    languageCode: LanguageCode;
    stringKey: string | [string, string];
    stringInLanguage: string;
  }> = [];
  forEachUiString(uiStrings, (entry) => {
    entries.push(entry);
  });

  expect([...entries].sort()).toEqual(
    [
      {
        languageCode: LanguageCode.ENGLISH,
        stringKey: 'A',
        stringInLanguage: 'One',
      },
      {
        languageCode: LanguageCode.ENGLISH,
        stringKey: ['B', 'C'],
        stringInLanguage: 'Two',
      },
      {
        languageCode: LanguageCode.ENGLISH,
        stringKey: ['B', 'D'],
        stringInLanguage: 'Three',
      },
      {
        languageCode: LanguageCode.SPANISH,
        stringKey: 'A',
        stringInLanguage: 'Uno',
      },
      {
        languageCode: LanguageCode.SPANISH,
        stringKey: ['B', 'C'],
        stringInLanguage: 'Dos',
      },
      {
        languageCode: LanguageCode.SPANISH,
        stringKey: ['B', 'D'],
        stringInLanguage: 'Tres',
      },
    ].sort()
  );
});
