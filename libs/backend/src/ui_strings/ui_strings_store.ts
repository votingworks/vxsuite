/* istanbul ignore file - tested via VxSuite apps. */

import { Client as DbClient } from '@votingworks/db';
import {
  LanguageCode,
  LanguageCodeSchema,
  safeParse,
} from '@votingworks/types';

/** Store interface for UI String API endpoints. */
export interface UiStringsStore {
  // TODO(kofi): Fill out.
  addLanguage(code: LanguageCode): void;
  getLanguages(): LanguageCode[];
}

/** Creates a shareable implementation of the {@link UiStringsStore}. */
export function createUiStringStore(dbClient: DbClient): UiStringsStore {
  return {
    addLanguage(languageCode: LanguageCode): void {
      dbClient.run(
        'insert or ignore into languages (code) values (?)',
        languageCode
      );
    },

    getLanguages(): LanguageCode[] {
      const result = dbClient.all('select code from languages') as Array<{
        code: string;
      }>;

      return result.map((row) =>
        safeParse(LanguageCodeSchema, row.code).unsafeUnwrap()
      );
    },
  };
}
