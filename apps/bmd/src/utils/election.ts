import { BallotStyle, Election } from '../config/types'

export const getContests = ({
  ballotStyle,
  election,
}: {
  ballotStyle: BallotStyle
  election: Election
}) =>
  election.contests.filter(
    c =>
      ballotStyle.districts.includes(c.districtId) &&
      ballotStyle.partyId === c.partyId
  )

export const getBallotStyle = ({
  ballotStyleId,
  election,
}: {
  ballotStyleId: string
  election: Election
}) => election.ballotStyles.find(bs => bs.id === ballotStyleId) as BallotStyle

export default { getBallotStyle, getContests }
