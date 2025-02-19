import { afterAll, beforeEach, expect, test, vi } from 'vitest';
import {
  VendoredTranslations,
  mockCloudTranslatedText,
  makeMockGoogleCloudTranslationClient,
} from '@votingworks/backend';
import { LanguageCode } from '@votingworks/types';
import { mockBaseLogger } from '@votingworks/logging';
import { GoogleCloudTranslatorWithDbCache } from './translator';
import { TestStore } from '../test/test_store';

const logger = mockBaseLogger({ fn: vi.fn });
const testStore = new TestStore(logger);

beforeEach(async () => {
  await testStore.init();
});

afterAll(async () => {
  await testStore.cleanUp();
});

test('GoogleCloudTranslatorWithDbCache', async () => {
  const store = testStore.getStore();

  const translationClient = makeMockGoogleCloudTranslationClient({
    fn: vi.fn,
  });
  const translator = new GoogleCloudTranslatorWithDbCache({
    store,
    translationClient,
  });

  let translatedTextArray = await translator.translateText(
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

  // Expect two cache hits and one cache miss
  translatedTextArray = await translator.translateText(
    ['Do you like apples?', 'Do you like bananas?', 'Do you like oranges?'],
    LanguageCode.SPANISH
  );
  expect(translatedTextArray).toEqual([
    mockCloudTranslatedText('Do you like apples?', LanguageCode.SPANISH),
    mockCloudTranslatedText('Do you like bananas?', LanguageCode.SPANISH),
    mockCloudTranslatedText('Do you like oranges?', LanguageCode.SPANISH),
  ]);
  expect(translationClient.translateText).toHaveBeenCalledTimes(1);
  expect(translationClient.translateText).toHaveBeenNthCalledWith(
    1,
    expect.objectContaining({
      contents: ['Do you like bananas?'],
      targetLanguageCode: LanguageCode.SPANISH,
    })
  );
  translationClient.translateText.mockClear();

  // Expect three cache hits
  translatedTextArray = await translator.translateText(
    ['Do you like apples?', 'Do you like bananas?', 'Do you like oranges?'],
    LanguageCode.SPANISH
  );
  expect(translatedTextArray).toEqual([
    mockCloudTranslatedText('Do you like apples?', LanguageCode.SPANISH),
    mockCloudTranslatedText('Do you like bananas?', LanguageCode.SPANISH),
    mockCloudTranslatedText('Do you like oranges?', LanguageCode.SPANISH),
  ]);
  expect(translationClient.translateText).not.toHaveBeenCalled();

  // Expect no cache hits because, though these strings have been translated before, they haven't
  // been translated to this specific language
  translatedTextArray = await translator.translateText(
    ['Do you like apples?', 'Do you like bananas?', 'Do you like oranges?'],
    LanguageCode.CHINESE_TRADITIONAL
  );
  expect(translatedTextArray).toEqual([
    mockCloudTranslatedText(
      'Do you like apples?',
      LanguageCode.CHINESE_TRADITIONAL
    ),
    mockCloudTranslatedText(
      'Do you like bananas?',
      LanguageCode.CHINESE_TRADITIONAL
    ),
    mockCloudTranslatedText(
      'Do you like oranges?',
      LanguageCode.CHINESE_TRADITIONAL
    ),
  ]);
  expect(translationClient.translateText).toHaveBeenCalledTimes(1);
  expect(translationClient.translateText).toHaveBeenNthCalledWith(
    1,
    expect.objectContaining({
      contents: [
        'Do you like apples?',
        'Do you like bananas?',
        'Do you like oranges?',
      ],
      targetLanguageCode: LanguageCode.CHINESE_TRADITIONAL,
    })
  );
});

test('GoogleCloudTranslatorWithDbCache vendored translations', async () => {
  const vendoredTranslations: VendoredTranslations = {
    [LanguageCode.CHINESE_SIMPLIFIED]: {},
    [LanguageCode.CHINESE_TRADITIONAL]: {},
    [LanguageCode.SPANISH]: {
      'Do you like apples?': 'A vendored Spanish translation',
    },
  };
  const store = testStore.getStore();
  const translationClient = makeMockGoogleCloudTranslationClient({
    fn: vi.fn,
  });
  const translator = new GoogleCloudTranslatorWithDbCache({
    store,
    translationClient,
    vendoredTranslations,
  });

  // Add a cache entry so that we can confirm that vendored translations take precedence over the
  // cloud translation cache
  await store.addTranslationCacheEntry({
    text: 'Do you like apples?',
    targetLanguageCode: LanguageCode.SPANISH,
    translatedText: mockCloudTranslatedText(
      'Do you like apples?',
      LanguageCode.SPANISH
    ),
  });

  const translatedTextArray = await translator.translateText(
    ['Do you like apples?', 'Do you like bananas?'],
    LanguageCode.SPANISH
  );
  expect(translatedTextArray).toEqual([
    'A vendored Spanish translation',
    mockCloudTranslatedText('Do you like bananas?', LanguageCode.SPANISH),
  ]);
  expect(translationClient.translateText).toHaveBeenCalledTimes(1);
  expect(translationClient.translateText).toHaveBeenNthCalledWith(
    1,
    expect.objectContaining({
      contents: ['Do you like bananas?'],
      targetLanguageCode: LanguageCode.SPANISH,
    })
  );
  translationClient.translateText.mockClear();
});
