import {
  electionFamousNames2021Fixtures,
  electionGeneralFixtures,
} from '@votingworks/fixtures';
import {
  Election,
  ElectionDefinition,
  LanguageCode,
  safeParseElectionDefinition,
} from '@votingworks/types';

/** The famous-names election used by the screenshot tests. */
export function getFamousNamesElectionDefinition(): ElectionDefinition {
  return electionFamousNames2021Fixtures.readElectionDefinition();
}

// Languages to generate ballot-style variants for, matching electionGeneral's
// translations. English is first so it is the default ballot style.
const GENERAL_ELECTION_BALLOT_LANGUAGES: LanguageCode[] = [
  LanguageCode.ENGLISH,
  LanguageCode.SPANISH,
  LanguageCode.CHINESE_SIMPLIFIED,
  LanguageCode.CHINESE_TRADITIONAL,
];

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
