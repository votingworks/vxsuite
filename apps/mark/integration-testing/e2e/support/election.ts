import {
  electionFamousNames2021Fixtures,
  electionGeneralFixtures,
} from '@votingworks/fixtures';
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

// Languages to generate ballot-style variants for, matching electionGeneral's
// translations. English is first so it is the default ballot style.
const GENERAL_ELECTION_BALLOT_LANGUAGES = ['en', 'es-US', 'zh-Hans', 'zh-Hant'];

/**
 * The general election, patched so each ballot style becomes a group of
 * per-language variants (the structure VxDesign produces for multi-language
 * elections). A voter session starts on the English variant; switching the
 * ballot language swaps to the matching variant (see useBallotStyleManager),
 * and the BMD ballot then renders dual-language (e.g. Chinese + English).
 */
export function getMultiLanguageGeneralElectionDefinition(): ElectionDefinition {
  const baseElectionDefinition =
    electionGeneralFixtures.readElectionDefinition();
  const ballotStyles = baseElectionDefinition.election.ballotStyles.flatMap(
    (ballotStyle) =>
      GENERAL_ELECTION_BALLOT_LANGUAGES.map((language) => ({
        ...ballotStyle,
        id: `${ballotStyle.groupId}_${language}`,
        languages: [language],
      }))
  );
  const patchedElection: Election = {
    ...baseElectionDefinition.election,
    ballotStyles,
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
