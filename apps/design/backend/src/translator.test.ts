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
import { MAX_POSTGRES_INDEX_KEY_BYTES } from './globals';

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

test('GoogleCloudTranslatorWithDbCache strips images before caching', async () => {
  const store = testStore.getStore();

  const translationClient = makeMockGoogleCloudTranslationClient({
    fn: vi.fn,
  });
  const translator = new GoogleCloudTranslatorWithDbCache({
    store,
    translationClient,
  });

  // Create a large string with an image that exceeds the postgres index key limit
  const largeString = `Large string: <img src="data:image/png;base64,${'x'.repeat(
    MAX_POSTGRES_INDEX_KEY_BYTES
  )}" />`;
  const smallString = 'Small string';

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
  // Large string should be stripped of images
  expect(translationClient.translateText).toHaveBeenCalledWith(
    expect.objectContaining({
      contents: ['Large string: <ph id="0" />', smallString],
      targetLanguageCode: LanguageCode.SPANISH,
    })
  );
  translationClient.translateText.mockClear();

  // Both strings should now be cached, so translateText should not be called again
  translatedTextArray = await translator.translateText(
    [largeString, smallString],
    LanguageCode.SPANISH
  );
  expect(translatedTextArray).toEqual([
    mockCloudTranslatedText(largeString, LanguageCode.SPANISH),
    mockCloudTranslatedText(smallString, LanguageCode.SPANISH),
  ]);

  expect(translationClient.translateText).not.toHaveBeenCalled();
});

test('GoogleCloudTranslatorWithDbCache does not cache extremely large strings', async () => {
  const store = testStore.getStore();

  const translationClient = makeMockGoogleCloudTranslationClient({
    fn: vi.fn,
  });
  const translator = new GoogleCloudTranslatorWithDbCache({
    store,
    translationClient,
  });

  const largeString = `Large content without images: ${'x'.repeat(
    MAX_POSTGRES_INDEX_KEY_BYTES
  )}`;
  const smallString = 'Small content';

  // First translation, both strings get translated
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
      contents: [largeString, smallString],
      targetLanguageCode: LanguageCode.SPANISH,
    })
  );
  translationClient.translateText.mockClear();

  // Second translation
  translatedTextArray = await translator.translateText(
    [largeString, smallString],
    LanguageCode.SPANISH
  );
  expect(translatedTextArray).toEqual([
    mockCloudTranslatedText(largeString, LanguageCode.SPANISH),
    mockCloudTranslatedText(smallString, LanguageCode.SPANISH),
  ]);

  expect(translationClient.translateText).toHaveBeenCalledTimes(1);
  // Only the large string gets translated again because it wasn't cached
  expect(translationClient.translateText).toHaveBeenCalledWith(
    expect.objectContaining({
      contents: [largeString],
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
