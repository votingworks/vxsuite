import type { Translator } from '@votingworks/backend';

/**
 * A translator that tags English text with the target language instead of
 * translating it, so multilingual elections render without a translation
 * service and with fonts every image has.
 */
export function createPseudoTranslator(): Translator {
  return {
    translateText: (textArray, targetLanguageCode) =>
      Promise.resolve(
        textArray.map((text) => `[${targetLanguageCode}] ${text}`)
      ),
  };
}
