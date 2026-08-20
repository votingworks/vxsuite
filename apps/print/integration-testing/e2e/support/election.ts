import { electionPrimaryPrecinctSplitsFixtures } from '@votingworks/fixtures';
import type { ElectionDefinition } from '@votingworks/types';

/**
 * A closed-primary election (parties Mammal/Fish) where Precinct 4 has two
 * splits and which ships multiple ballot languages. This exercises the maximal
 * set of VxPrint options: precinct, split, party, and language selection on the
 * Print screen, and Party + Language columns on the Report screen.
 */
export function getElectionDefinition(): ElectionDefinition {
  return electionPrimaryPrecinctSplitsFixtures.readElectionDefinition();
}

/** Polling place whose precinct (Precinct 4) has splits. */
export const SPLIT_POLLING_PLACE = 'Precinct 4';

/** Polling place whose precinct (Precinct 1) has no splits. */
export const NO_SPLIT_POLLING_PLACE = 'Precinct 1';
