import { Tally } from '@votingworks/types';

export function fakeTally(props: Partial<Tally> = {}): Tally {
  return {
    numberOfBallotsCounted: 0,
    castVoteRecords: new Set(),
    contestTallies: {},
    ballotCountsByVotingMethod: {},
    ...props,
  };
}
