import {
  ElectionStringKey,
  LanguageCode,
  UiStringTranslations,
} from '@votingworks/types';
import { format } from '@votingworks/utils';

// The ballotLanguage strings for a single display language: every supported
// language's name as rendered in `displayLanguageCode`. Unlike most election
// strings, these aren't machine-translated via the cloud translator; VxDesign
// generates them from the Intl API via the same `format.languageDisplayName`
// util we use here.
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
 * Registered in an election package's uiStrings (for the integration-test
 * screenshot suites) so the voter language selector lists each language and
 * renders its name in its own language (e.g. "español", "简体中文"). The explicit
 * `Record<LanguageCode, ...>` makes the type checker flag a missing entry
 * whenever a new language is added.
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
