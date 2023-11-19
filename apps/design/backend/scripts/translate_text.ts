import { extractErrorMessage } from '@votingworks/basics';
import { LanguageCode } from '@votingworks/types';

import { GoogleCloudTranslator } from '../src/language_and_audio/translator';
import { Store } from '../src/store';

const languageCodes: Set<string> = (() => {
  const nonEnglishLanguageCodes = new Set<string>(Object.values(LanguageCode));
  nonEnglishLanguageCodes.delete(LanguageCode.ENGLISH);
  return nonEnglishLanguageCodes;
})();
const usageMessage = `Usage: translate-text 'Text to translate' <target-language-code>

Arguments:
  <target-language-code>\t${[...languageCodes].sort().join(' | ')}`;

interface TranslateTextInput {
  targetLanguageCode: LanguageCode;
  text: string;
}

function parseCommandLineArgs(args: readonly string[]): TranslateTextInput {
  if (args.length !== 2 || !languageCodes.has(args[1])) {
    console.error(usageMessage);
    process.exit(1);
  }
  const [text, targetLanguageCode] = args as [string, LanguageCode];
  return { targetLanguageCode, text };
}

async function translateText({
  targetLanguageCode,
  text,
}: TranslateTextInput): Promise<void> {
  const store = Store.memoryStore();
  const translator = new GoogleCloudTranslator({ store });
  const [translatedText] = await translator.translateText(
    [text],
    targetLanguageCode
  );
  console.log(translatedText);
}

/**
 * A script for translating text using the Google Cloud Translation API
 */
export async function main(args: readonly string[]): Promise<void> {
  try {
    await translateText(parseCommandLineArgs(args));
  } catch (error) {
    console.error(`❌ ${extractErrorMessage(error)}`);
    process.exit(1);
  }
}
