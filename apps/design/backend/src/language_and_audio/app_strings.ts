import fs from 'fs/promises';
import path from 'path';
import { z } from 'zod';
import {
  LanguageCode,
  safeParseJson,
  UiStringsPackage,
} from '@votingworks/types';

import { GoogleCloudTranslator } from './translator';
import { setUiString } from './utils';

export async function translateAppStrings(
  translator: GoogleCloudTranslator
): Promise<UiStringsPackage> {
  const appStringsCatalogFileContents = await fs.readFile(
    path.join(
      __dirname,
      // TODO: Account for system version
      '../../../../../libs/ui/src/ui_strings/app_strings_catalog/latest.json'
    ),
    'utf-8'
  );
  const appStringsCatalog = safeParseJson(
    appStringsCatalogFileContents,
    z.record(z.string())
  ).unsafeUnwrap();

  const appStringKeys = Object.keys(appStringsCatalog).sort();
  const appStringsInEnglish = appStringKeys.map(
    (key) => appStringsCatalog[key]
  );

  const appStrings: UiStringsPackage = {};
  for (const languageCode of Object.values(LanguageCode)) {
    const appStringsInLanguage =
      languageCode === LanguageCode.ENGLISH
        ? appStringsInEnglish
        : await translator.translateText(appStringsInEnglish, languageCode);
    for (const [i, key] of appStringKeys.entries()) {
      setUiString(appStrings, languageCode, key, appStringsInLanguage[i]);
    }
  }

  return appStrings;
}
