import {
  UiStringAudioIdsPackage,
  UiStringsPackage,
  LanguageCode,
} from '@votingworks/types';
import {
  cleanText,
  forEachUiString,
  prepareTextForSpeechSynthesis,
  Segment,
  setUiString,
  setUiStringAudioIds,
  splitInterpolatedText,
} from './utils';

test.each<{ input: string; expectedOutput: string }>([
  {
    input: 'Do you prefer <1>apple pie</1> or <3>orange marmalade</3>?',
    expectedOutput: 'Do you prefer apple pie or orange marmalade?',
  },
  {
    input: 'Do you prefer apple pie or orange marmalade?',
    expectedOutput: 'Do you prefer apple pie or orange marmalade?',
  },
])('cleanText - $input', ({ input, expectedOutput }) => {
  expect(cleanText(input)).toEqual(expectedOutput);
});

test.each<{ input: string; expectedOutput: Segment[] }>([
  {
    input: 'I see {{count1}} cats and {{count2}} dogs.',
    expectedOutput: [
      { content: 'I see', isInterpolated: false },
      { content: '{{count1}}', isInterpolated: true },
      { content: 'cats and', isInterpolated: false },
      { content: '{{count2}}', isInterpolated: true },
      { content: 'dogs.', isInterpolated: false },
    ],
  },
  {
    input: '{{name}} is my name',
    expectedOutput: [
      { content: '{{name}}', isInterpolated: true },
      { content: 'is my name', isInterpolated: false },
    ],
  },
  {
    input: 'My name is {{name}}',
    expectedOutput: [
      { content: 'My name is', isInterpolated: false },
      { content: '{{name}}', isInterpolated: true },
    ],
  },
  {
    input: 'My name is {{name}}.',
    expectedOutput: [
      { content: 'My name is', isInterpolated: false },
      { content: '{{name}}', isInterpolated: true },
    ],
  },
  {
    input: 'My name is {{name}}!',
    expectedOutput: [
      { content: 'My name is', isInterpolated: false },
      { content: '{{name}}', isInterpolated: true },
    ],
  },
  {
    input: 'Is your name {{name}}?',
    expectedOutput: [
      { content: 'Is your name', isInterpolated: false },
      { content: '{{name}}', isInterpolated: true },
    ],
  },
  {
    input: 'Vote for {{count}}:',
    expectedOutput: [
      { content: 'Vote for', isInterpolated: false },
      { content: '{{count}}', isInterpolated: true },
    ],
  },
  {
    input: 'Vote for {{count}}: ',
    expectedOutput: [
      { content: 'Vote for', isInterpolated: false },
      { content: '{{count}}', isInterpolated: true },
    ],
  },
  {
    input: 'Vote for {{count}}...',
    expectedOutput: [
      { content: 'Vote for', isInterpolated: false },
      { content: '{{count}}', isInterpolated: true },
    ],
  },
  {
    input: '0 {{unit}} remaining.',
    expectedOutput: [
      { content: '0', isInterpolated: false },
      { content: '{{unit}}', isInterpolated: true },
      { content: 'remaining.', isInterpolated: false },
    ],
  },
  { input: ' ', expectedOutput: [] },
  { input: "'", expectedOutput: [{ content: "'", isInterpolated: false }] },
  { input: '"', expectedOutput: [{ content: '"', isInterpolated: false }] },
  { input: ',', expectedOutput: [{ content: ',', isInterpolated: false }] },
  { input: '.', expectedOutput: [{ content: '.', isInterpolated: false }] },
  { input: '-', expectedOutput: [{ content: '-', isInterpolated: false }] },
])('splitInterpolatedText - "$input"', ({ input, expectedOutput }) => {
  expect(splitInterpolatedText(input)).toEqual(expectedOutput);
});

test.each<{
  languageCode: LanguageCode;
  text: string;
  expectedOutput: Array<{ audioId: string; segment: Segment }>;
}>([
  {
    languageCode: LanguageCode.ENGLISH,
    text: 'Would you rather have {{count1}} <1>apple pies</1> or {{count2}} <3>key lime pies</3>?',
    expectedOutput: [
      {
        audioId: '68411c2228',
        segment: { content: 'Would you rather have', isInterpolated: false },
      },
      {
        audioId: '{{count1}}',
        segment: { content: '{{count1}}', isInterpolated: true },
      },
      {
        audioId: '44dcb41a1a',
        segment: { content: 'apple pies or', isInterpolated: false },
      },
      {
        audioId: '{{count2}}',
        segment: { content: '{{count2}}', isInterpolated: true },
      },
      {
        audioId: '3afbfe74b7',
        segment: { content: 'key lime pies?', isInterpolated: false },
      },
    ],
  },
  {
    languageCode: LanguageCode.ENGLISH,
    text: '1234',
    expectedOutput: [
      {
        audioId: 'af14c6060f',
        segment: { content: '1234', isInterpolated: false },
      },
    ],
  },
  {
    languageCode: LanguageCode.SPANISH,
    text: '1234',
    expectedOutput: [
      {
        audioId: '695752ff7c',
        segment: { content: '1234', isInterpolated: false },
      },
    ],
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
