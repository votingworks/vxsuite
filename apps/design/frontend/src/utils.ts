import type { Precinct, PrecinctWithSplits } from '@votingworks/design-backend';

export function hasSplits(precinct: Precinct): precinct is PrecinctWithSplits {
  return 'splits' in precinct && precinct.splits !== undefined;
}
