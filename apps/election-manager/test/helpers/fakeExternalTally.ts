import { ExternalTally } from '../../src/config/types'

export default function fakeTally(
  props: Partial<ExternalTally> = {}
): ExternalTally {
  return {
    numberOfBallotsCounted: 0,
    contestTallies: {},
    ...props,
  }
}
