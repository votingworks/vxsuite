import {
  electionFamousNames2021Fixtures,
  electionGeneralFixtures,
} from '@votingworks/fixtures';
import {
  type Election,
  type ElectionDefinition,
  hashElectionData,
  LanguageCode,
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
 * per-language variants.
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
  const election: Election = {
    ...baseElectionDefinition.election,
    ballotStyles,
  };

  const electionData = JSON.stringify(election);
  const ballotHash = hashElectionData(electionData);

  return { ballotHash, election, electionData };
}
