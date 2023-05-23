import {
  Dictionary,
  ManualTally,
  FullElectionManualTally,
  TallyCategory,
} from '@votingworks/types';
import { assert } from '@votingworks/basics';

import type { ServerFullElectionManualTally } from '@votingworks/admin-backend';

export function convertServerFullElectionManualTally(
  serverFullElectionManualTally: ServerFullElectionManualTally
): FullElectionManualTally {
  const resultsByCategory: Map<
    TallyCategory,
    Dictionary<ManualTally>
  > = new Map();
  for (const [tallyCategory, indexedTallies] of Object.entries(
    serverFullElectionManualTally.resultsByCategory
  )) {
    assert(indexedTallies);
    resultsByCategory.set(tallyCategory as TallyCategory, indexedTallies);
  }

  return {
    ...serverFullElectionManualTally,
    resultsByCategory,
  };
}
