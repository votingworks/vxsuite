import { LanguageCode } from '@votingworks/types';
import {
  mockCloudTranslatedText,
  MockGoogleCloudTranslationClient,
} from './test_utils';
import { GoogleCloudTranslator } from './translator';

test('GoogleCloudTranslator', async () => {
  const translationClient = new MockGoogleCloudTranslationClient();
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

test('GoogleCloudTranslator strips large img src data urls', async () => {
  const translationClient = new MockGoogleCloudTranslationClient();
  const translator = new GoogleCloudTranslator({ translationClient });

  const textWithLargeSrc = [
    '<img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA"/> Do you like apples?',
    '<img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA"/> Do you like oranges?',
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
    `<img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA"/> ${mockCloudTranslatedText(
      'Do you like oranges?',
      LanguageCode.SPANISH
    )}`,
  ]);
  expect(translationClient.translateText).toHaveBeenCalledTimes(1);
  expect(translationClient.translateText).toHaveBeenNthCalledWith(
    1,
    expect.objectContaining({
      contents: [
        '<img src="0"/> Do you like apples?',
        '<img src="0"/> Do you like oranges?',
      ],
      targetLanguageCode: LanguageCode.SPANISH,
    })
  );
  translationClient.translateText.mockClear();
});
