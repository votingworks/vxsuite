import { ManualTally } from '@votingworks/types';

export function fakeManualTally(props: Partial<ManualTally> = {}): ManualTally {
  return {
    numberOfBallotsCounted: 0,
    contestTallies: {},
    ...props,
  };
}
