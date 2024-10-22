import { z } from 'zod';
import { mapObject, mergeObjects } from '@votingworks/basics';
import { Dictionary } from './generic';

/**
 * Voter-facing election string content that need to be translated and/or
 * spoken.
 */
export enum ElectionStringKey {
  BALLOT_LANGUAGE = 'ballotLanguage',
  BALLOT_STYLE_ID = 'ballotStyleId',
  CANDIDATE_NAME = 'candidateName',
  CONTEST_DESCRIPTION = 'contestDescription',
  CONTEST_OPTION_LABEL = 'contestOptionLabel',
  CONTEST_TERM = 'contestTerm',
  CONTEST_TITLE = 'contestTitle',
  COUNTY_NAME = 'countyName',
  DISTRICT_NAME = 'districtName',
  ELECTION_DATE = 'electionDate',
  ELECTION_TITLE = 'electionTitle',
  PARTY_FULL_NAME = 'partyFullName',
  PARTY_NAME = 'partyName',
  PRECINCT_NAME = 'precinctName',
  STATE_NAME = 'stateName',
}

/**
 * Map of UI string key to related translation in a given language.
 *
 * Follows i18next key schema and supports one level of nesting.
 * See: https://www.i18next.com/misc/json-format
 */
export type UiStringTranslations = Dictionary<string | Dictionary<string>>;

/**
 * Map of UI string key to related translation in a given language.
 *
 * Follows i18next key schema and supports one level of nesting.
 * See: https://www.i18next.com/misc/json-format
 */
export const UiStringTranslationsSchema: z.ZodType<UiStringTranslations> =
  z.record(z.union([z.string(), z.record(z.string())]));

/**
 * Map of language code to {@link UiStringTranslations}.
 */
export interface UiStringsPackage {
  [key: string]: UiStringTranslations;
}

/**
 * Map of language code to {@link UiStringTranslations}.
 */
export const UiStringsPackageSchema: z.ZodType<UiStringsPackage> = z.record(
  z.string(),
  UiStringTranslationsSchema
);

/**
 * Combines two UI strings packages, returning a new package. The second package
 * takes precedence in the case of key conflicts.
 */
export function mergeUiStrings(
  strings: UiStringsPackage,
  ...otherStrings: UiStringsPackage[]
): UiStringsPackage {
  return otherStrings.reduce((acc, other) => mergeObjects(acc, other), strings);
}

/**
 * Filters a UI strings package, returning a new package with only the keys that
 * pass the condition function.
 */
export function filterUiStrings(
  uiStrings: UiStringsPackage,
  condition: (key: string) => boolean
): UiStringsPackage {
  return mapObject(uiStrings, (languageStrings) =>
    Object.fromEntries(
      Object.entries(languageStrings).filter(([key]) => condition(key))
    )
  );
}
