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

export const getPrecinctById = ({
  election,
  precinctId,
}: {
  election: Election
  precinctId: string
}) => election.precincts.find(p => p.id === precinctId)

export const getBallotStyle = ({
  ballotStyleId,
  election,
}: {
  ballotStyleId: string
  election: Election
}) => election.ballotStyles.find(bs => bs.id === ballotStyleId) as BallotStyle

export const getPartyPrimaryAdjectiveFromBallotStyle = ({
  ballotStyleId,
  election,
}: {
  ballotStyleId: string
  election: Election
}) => {
  const parts = ballotStyleId && ballotStyleId.match(/(\d+)(\w+)/i)
  const abbrev = parts && parts[2]
  const party = abbrev && election.parties.find(p => p.abbrev === abbrev)
  const name = party && party.name
  return (name === 'Democrat' && 'Democratic') || name || ''
}

export const getZeroTally = (election: Election) =>
  election.contests.map(contest => {
    /* istanbul ignore else */
    if (contest.type === 'yesno') {
      return [0, 0]
    } else if (contest.type === 'candidate') {
      return contest.candidates.map(() => 0)
    } else {
      return []
    }
  })

export default {
  getBallotStyle,
  getContests,
  getPartyPrimaryAdjectiveFromBallotStyle,
  getPrecinctById,
  getZeroTally,
}
