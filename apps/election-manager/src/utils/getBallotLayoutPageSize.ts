import { BallotPaperSize, Election } from '@votingworks/types'

export const getBallotLayoutPageSize = (election: Election): string =>
  (election.ballotLayout?.paperSize || BallotPaperSize.Letter).toLowerCase()

export default getBallotLayoutPageSize
