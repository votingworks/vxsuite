import { expect, test } from 'vitest';
import { LanguageCode } from '@votingworks/types';
import { createEnglishOnlyTranslator } from './english_only_translator.js';

test('rejects any translation', async () => {
  await expect(
    createEnglishOnlyTranslator().translateText(['Mayor'], LanguageCode.SPANISH)
  ).rejects.toThrow(
    'Ballot proofs can only be rendered for English-only elections, not es-US'
  );
});
