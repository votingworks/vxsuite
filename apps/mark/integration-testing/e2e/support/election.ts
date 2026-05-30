import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import {
  Election,
  ElectionDefinition,
  UiStringsPackage,
  safeParseElectionDefinition,
} from '@votingworks/types';

// Inject multi-language ballot strings so the voter language selector appears.
// Each language needs its own name in its own script; other languages fall back
// to English display names via the Intl API. Mirrors the scan integration tests.
const multiLangBallotStrings: UiStringsPackage = {
  en: {
    ballotLanguage: {
      en: 'English',
      es: 'Spanish',
      'zh-Hans': 'Simplified Chinese',
      'zh-Hant': 'Traditional Chinese',
    },
  },
  // spell-checker: disable-next-line
  es: {
    ballotLanguage: {
      en: 'inglés',
      es: 'español',
      'zh-Hans': 'chino simplificado',
      'zh-Hant': 'chino tradicional',
    },
  },
  'zh-Hans': {
    ballotLanguage: {
      en: '英语',
      es: '西班牙语',
      'zh-Hans': '简体中文',
      'zh-Hant': '繁体中文',
    },
  },
  'zh-Hant': {
    ballotLanguage: {
      en: '英文',
      es: '西班牙文',
      'zh-Hans': '簡體中文',
      'zh-Hant': '繁體中文',
    },
  },
};

/**
 * The famous-names election patched with multi-language ballot strings so the
 * voter-facing language selector renders. The `uiStrings` registered in the
 * election package (see callers) supply the language codes; the display names
 * come from these `ballotStrings`.
 */
export function getMultiLanguageFamousNamesElectionDefinition(): ElectionDefinition {
  const baseElectionDefinition =
    electionFamousNames2021Fixtures.readElectionDefinition();
  const patchedElection: Election = {
    ...baseElectionDefinition.election,
    ballotStrings: {
      ...baseElectionDefinition.election.ballotStrings,
      ...multiLangBallotStrings,
    },
  };
  return safeParseElectionDefinition(
    JSON.stringify(patchedElection)
  ).unsafeUnwrap();
}

/** The set of language codes registered alongside the patched election. */
export const MULTI_LANGUAGE_UI_STRINGS: UiStringsPackage = {
  en: {},
  es: {},
  'zh-Hans': {},
  'zh-Hant': {},
};
