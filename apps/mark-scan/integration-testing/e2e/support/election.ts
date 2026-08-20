import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import type { ElectionDefinition } from '@votingworks/types';

/** The famous-names election used by the screenshot tests. */
export function getFamousNamesElectionDefinition(): ElectionDefinition {
  return electionFamousNames2021Fixtures.readElectionDefinition();
}
