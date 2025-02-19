import { expect, test, vi } from 'vitest';
import { LanguageCode } from '@votingworks/types';
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
