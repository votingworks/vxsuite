import { expect, test, vi } from 'vitest';
import { LanguageCode } from '@votingworks/types';
import { assert } from '@votingworks/basics';
import {
  mockCloudTranslatedText,
  makeMockGoogleCloudTranslationClient,
} from './test_utils';
import { GoogleCloudTranslator } from './translator';

test('GoogleCloudTranslator', async () => {
  const translationClient = makeMockGoogleCloudTranslationClient({ fn: vi.fn });
  const translator = new GoogleCloudTranslator({ translationClient });

  const translatedTextArray = await translator.translateText(
    ['Do you like apples?', 'Do you like oranges?'],
    LanguageCode.SPANISH
  );
  expect(translatedTextArray).toEqual([
    mockCloudTranslatedText('Do you like apples?', LanguageCode.SPANISH),
    mockCloudTranslatedText('Do you like oranges?', LanguageCode.SPANISH),
  ]);
  expect(translationClient.translateText).toHaveBeenCalledTimes(1);
  expect(translationClient.translateText).toHaveBeenNthCalledWith(
    1,
    expect.objectContaining({
      contents: ['Do you like apples?', 'Do you like oranges?'],
      targetLanguageCode: LanguageCode.SPANISH,
    })
  );
  translationClient.translateText.mockClear();
});

test('GoogleCloudTranslator strips image elements', async () => {
  const translationClient = makeMockGoogleCloudTranslationClient({ fn: vi.fn });
  const translator = new GoogleCloudTranslator({ translationClient });

  const textWithLargeSrc = [
    '<img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA"/> Do you like apples?',
    '<IMG src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA"/> <Svg with="42"><g>QQ</g></svg> Do you like oranges?',
  ];

  const translatedTextArray = await translator.translateText(
    textWithLargeSrc,
    LanguageCode.SPANISH
  );

  expect(translatedTextArray).toEqual([
    `<img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA"/> ${mockCloudTranslatedText(
      'Do you like apples?',
      LanguageCode.SPANISH
    )}`,
    `<IMG src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA"/> <Svg with="42"><g>QQ</g></svg> ${mockCloudTranslatedText(
      'Do you like oranges?',
      LanguageCode.SPANISH
    )}`,
  ]);
  expect(translationClient.translateText).toHaveBeenCalledTimes(1);
  expect(translationClient.translateText).toHaveBeenNthCalledWith(
    1,
    expect.objectContaining({
      contents: [
        '<ph id="0" /> Do you like apples?',
        '<ph id="0" /> <ph id="1" /> Do you like oranges?',
      ],
      targetLanguageCode: LanguageCode.SPANISH,
    })
  );
  translationClient.translateText.mockClear();
});

test('splits batches based on character limit', async () => {
  const translationClient = makeMockGoogleCloudTranslationClient({ fn: vi.fn });
  const translator = new GoogleCloudTranslator({ translationClient });

  const text = 'Do you like apples? '.repeat(50);
  expect(text).toHaveLength(1_000);
  const textArray = Array.from<string>({ length: 65 }).fill(text);

  const translatedTextArray = await translator.translateText(
    textArray,
    LanguageCode.SPANISH
  );
  expect(translatedTextArray).toEqual(
    textArray.map((t) => mockCloudTranslatedText(t, LanguageCode.SPANISH))
  );

  expect(translationClient.translateText).toHaveBeenCalledTimes(3);
  for (const [callIndex, batchSize] of [30, 30, 5].entries()) {
    const call = translationClient.translateText.mock.calls[callIndex];
    assert(!!call);

    expect(call[0].contents).toHaveLength(batchSize);
  }
});

test('splits batches based on item count limit', async () => {
  const translationClient = makeMockGoogleCloudTranslationClient({ fn: vi.fn });
  const translator = new GoogleCloudTranslator({ translationClient });

  const textArray = Array.from<string>({ length: 1025 }).fill(
    'Do you like apples?'
  );

  const translatedTextArray = await translator.translateText(
    textArray,
    LanguageCode.SPANISH
  );
  expect(translatedTextArray).toEqual(
    textArray.map((t) => mockCloudTranslatedText(t, LanguageCode.SPANISH))
  );

  expect(translationClient.translateText).toHaveBeenCalledTimes(2);
  for (const [callIndex, batchSize] of [1024, 1].entries()) {
    const call = translationClient.translateText.mock.calls[callIndex];
    assert(!!call);
    expect(call[0].contents).toHaveLength(batchSize);
  }
});

test('makes no requests for an empty text array', async () => {
  const translationClient = makeMockGoogleCloudTranslationClient({ fn: vi.fn });
  const translator = new GoogleCloudTranslator({ translationClient });

  expect(await translator.translateText([], LanguageCode.SPANISH)).toEqual([]);
  expect(translationClient.translateText).not.toHaveBeenCalled();
});

test('throws if translations are missing', async () => {
  const translationClient = makeMockGoogleCloudTranslationClient({ fn: vi.fn });
  translationClient.translateText.mockResolvedValue([{}, undefined, undefined]);
  const translator = new GoogleCloudTranslator({ translationClient });

  await expect(
    translator.translateText(['Do you like apples?'], LanguageCode.SPANISH)
  ).rejects.toThrow('Expected 1 translation(s), got 0');
});
