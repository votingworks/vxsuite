import { ExternalTally } from '@votingworks/types';

export function fakeTally(props: Partial<ExternalTally> = {}): ExternalTally {
  return {
    numberOfBallotsCounted: 0,
    contestTallies: {},
    ...props,
  };
}
