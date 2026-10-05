import {
  hashElectionData,
  type Election,
  type ElectionDefinition,
} from '@votingworks/types';
import { generateBallotStyleId } from './ballot_styles.js';

// [TODO] Move to libs/test-utils and consolidate with
// apps/mark/integration-testing/e2e/support/election.ts
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

  const electionData = JSON.stringify(modifiedElection);
  const ballotHash = hashElectionData(electionData);

  return { ballotHash, election: modifiedElection, electionData };
}
