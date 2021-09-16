import { Election } from '@votingworks/types'

export const getBallotLayoutDensity = (election: Election): number =>
  election.ballotLayout?.layoutDensity || 0

export default getBallotLayoutDensity
