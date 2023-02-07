import { ExternalTally } from '@votingworks/types';

export function fakeExternalTally(
  props: Partial<ExternalTally> = {}
): ExternalTally {
  return {
    numberOfBallotsCounted: 0,
    contestTallies: {},
    ...props,
  };
}
