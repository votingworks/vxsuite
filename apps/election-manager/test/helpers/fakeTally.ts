import { Tally } from '../../src/config/types'

export default function fakeTally(props: Partial<Tally> = {}): Tally {
  return {
    numberOfBallotsCounted: 0,
    castVoteRecords: [],
    contestTallies: {},
    ballotCountsByVotingMethod: {},
    ...props,
  }
}
