import {
  Election,
  ElectionDefinition,
  safeParseElectionDefinition,
} from '@votingworks/types';
import { generateBallotStyleId } from './ballot_styles';

export function getMockMultiLanguageElectionDefinition(
  electionDefinition: ElectionDefinition,
  languages: string[]
): ElectionDefinition {
  const { election } = electionDefinition;
  const modifiedElection: Election = {
    ...election,
    ballotStyles: election.ballotStyles.flatMap((ballotStyle, i) =>
      languages.map((languageCode) => ({
        ...ballotStyle,
        id: generateBallotStyleId({
          ballotStyleIndex: i + 1,
          languages: [languageCode],
        }),
        languages: [languageCode],
      }))
    ),
  };
  return safeParseElectionDefinition(
    JSON.stringify(modifiedElection)
  ).unsafeUnwrap();
}
