import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import {
  MachineVersion,
  safeParseJson,
  UiStringsPackage,
  BallotLanguageConfigs,
  getAllBallotLanguages,
  LanguageCode,
} from '@votingworks/types';

import { assertDefined } from '@votingworks/basics';
import { GoogleCloudTranslator } from './translator';
import { setUiString } from './utils';

/**
 * Creates a package of all translated app strings for the given code machine version,
 * for the languages specified in the ballot language configs.
 */
export async function translateAppStrings(
  translator: GoogleCloudTranslator,
  machineVersion: MachineVersion,
  ballotLanguageConfigs: BallotLanguageConfigs
): Promise<UiStringsPackage> {
  const languages = getAllBallotLanguages(ballotLanguageConfigs);

  const appStringsCatalogFileContents = await fs.readFile(
    path.join(
      __dirname,
      `../../../ui/src/ui_strings/app_strings_catalog/${machineVersion}.json`
    ),
    'utf-8'
  );
  const appStringsCatalog = safeParseJson(
    appStringsCatalogFileContents,
    z.record(z.string())
  ).unsafeUnwrap();

  const appStringKeys = Object.keys(appStringsCatalog).sort();
  const appStringsInEnglish = appStringKeys.map<string>((key) =>
    assertDefined(appStringsCatalog[key])
  );

  const appStrings: UiStringsPackage = {};
  for (const languageCode of languages) {
    const appStringsInLanguage =
      languageCode === LanguageCode.ENGLISH
        ? appStringsInEnglish
        : await translator.translateText(appStringsInEnglish, languageCode);
    for (const [i, key] of appStringKeys.entries()) {
      setUiString(
        appStrings,
        languageCode,
        key,
        assertDefined(appStringsInLanguage[i])
      );
    }
  }

  return appStrings;
}
