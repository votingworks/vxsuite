import { z } from 'zod';
import { mergeObjects } from '@votingworks/basics';
import { Dictionary } from './generic';
import { LanguageCode } from './language_code';

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
export type UiStringsPackage = Partial<
  Record<LanguageCode, UiStringTranslations>
>;

/**
 * Map of language code to {@link UiStringTranslations}.
 */
export const UiStringsPackageSchema: z.ZodType<UiStringsPackage> = z.record(
  z.nativeEnum(LanguageCode),
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
