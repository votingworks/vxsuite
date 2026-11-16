import type { Translator } from '@votingworks/backend';

/** A translator for English-only elections, which never need translation. */
export function createEnglishOnlyTranslator(): Translator {
  return {
    translateText: (_textArray, targetLanguageCode) =>
      Promise.reject(
        new Error(
          `Ballot proofs can only be rendered for English-only elections, not ${targetLanguageCode}`
        )
      ),
  };
}
