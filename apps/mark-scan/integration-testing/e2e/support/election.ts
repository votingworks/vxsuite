import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import {
  ElectionDefinition,
  ElectionStringKey,
  LanguageCode,
  UiStringTranslations,
} from '@votingworks/types';
import { format } from '@votingworks/utils';

/** The famous-names election used by the screenshot tests. */
export function getFamousNamesElectionDefinition(): ElectionDefinition {
  return electionFamousNames2021Fixtures.readElectionDefinition();
}

// The ballotLanguage strings for a single display language: every supported
// language's name as rendered in `displayLanguageCode`. The display names are
// sourced from the Intl API — the same way VxDesign generates them when
// building an election package (see the ballotLanguage extractor in
// libs/types/src/cdf/ballot-definition/convert.ts).
function ballotLanguageNames(
  displayLanguageCode: LanguageCode
): UiStringTranslations {
  return {
    [ElectionStringKey.BALLOT_LANGUAGE]: Object.fromEntries(
      Object.values(LanguageCode).map((languageCode) => [
        languageCode,
        format.languageDisplayName({ languageCode, displayLanguageCode }),
      ])
    ),
  };
}

/**
 * Registered in the election package's uiStrings so the voter language selector
 * lists each language and renders its name in its own language (e.g. "español",
 * "简体中文"). The explicit `Record<LanguageCode, ...>` makes the type checker flag
 * a missing entry whenever a new language is added.
 */
export const MULTI_LANGUAGE_UI_STRINGS: Record<
  LanguageCode,
  UiStringTranslations
> = {
  [LanguageCode.ENGLISH]: ballotLanguageNames(LanguageCode.ENGLISH),
  [LanguageCode.SPANISH]: ballotLanguageNames(LanguageCode.SPANISH),
  [LanguageCode.CHINESE_SIMPLIFIED]: ballotLanguageNames(
    LanguageCode.CHINESE_SIMPLIFIED
  ),
  [LanguageCode.CHINESE_TRADITIONAL]: ballotLanguageNames(
    LanguageCode.CHINESE_TRADITIONAL
  ),
};
