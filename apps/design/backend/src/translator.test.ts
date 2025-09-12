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

test('GoogleCloudTranslatorWithDbCache does not cache large strings over byte limit', async () => {
  const store = testStore.getStore();

  const translationClient = makeMockGoogleCloudTranslationClient({
    fn: vi.fn,
  });
  const translator = new GoogleCloudTranslatorWithDbCache({
    store,
    translationClient,
  });

  // Create a large string that exceeds the 8k byte limit (simulating an image)
  const largeString = `Large content: ${  'x'.repeat(8000)}`;
  const smallString = 'Small content';

  // First translation - both strings get translated
  let translatedTextArray = await translator.translateText(
    [largeString, smallString],
    LanguageCode.SPANISH
  );
  expect(translatedTextArray).toEqual([
    mockCloudTranslatedText(largeString, LanguageCode.SPANISH),
    mockCloudTranslatedText(smallString, LanguageCode.SPANISH),
  ]);
  expect(translationClient.translateText).toHaveBeenCalledTimes(1);
  expect(translationClient.translateText).toHaveBeenCalledWith(
    expect.objectContaining({
      contents: [largeString, smallString], // Both strings should be sent for translation
      targetLanguageCode: LanguageCode.SPANISH,
    })
  );
  translationClient.translateText.mockClear();

  // Second translation - large string gets translated again, small string should be cached
  translatedTextArray = await translator.translateText(
    [largeString, smallString],
    LanguageCode.SPANISH
  );
  expect(translatedTextArray).toEqual([
    mockCloudTranslatedText(largeString, LanguageCode.SPANISH),
    mockCloudTranslatedText(smallString, LanguageCode.SPANISH),
  ]);

  expect(translationClient.translateText).toHaveBeenCalledTimes(1);
  expect(translationClient.translateText).toHaveBeenCalledWith(
    expect.objectContaining({
      contents: [largeString], // Only large string, small one was cached
      targetLanguageCode: LanguageCode.SPANISH,
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
