import { Election, Contest, BallotStyle } from '@votingworks/ballot-encoder'
import { Tally } from '../config/types'

export const getContests = ({
  ballotStyle,
  election,
}: {
  ballotStyle: BallotStyle
  election: Election
}) =>
  ballotStyle &&
  election.contests.filter(
    (c) =>
      ballotStyle.districts.includes(c.districtId) &&
      ballotStyle.partyId === c.partyId
  )

export const getPrecinctById = ({
  election,
  precinctId,
}: {
  election: Election
  precinctId: string
}) => election.precincts.find((p) => p.id === precinctId)

export const getBallotStyle = ({
  election,
  ballotStyleId,
}: {
  election: Election
  ballotStyleId: string
}) => election.ballotStyles.find((bs) => bs.id === ballotStyleId)

export const getPartyPrimaryAdjectiveFromBallotStyle = ({
  ballotStyleId,
  election,
}: {
  ballotStyleId: string
  election: Election
}): string => {
  const parts = ballotStyleId?.match(/(\d+)(\w+)/i)
  const abbrev = parts?.[2]
  const party = election.parties.find((p) => p.abbrev === abbrev)
  const name = party?.name
  return name === 'Democrat' ? 'Democratic' : name ?? ''
}

export const getZeroTally = (election: Election): Tally =>
  election.contests.map((contest) => {
    /* istanbul ignore else */
    if (contest.type === 'yesno') {
      return { yes: 0, no: 0 }
    } else if (contest.type === 'ms-either-neither') {
      return {
        eitherOption: 0,
        neitherOption: 0,
        firstOption: 0,
        secondOption: 0,
      }
    } else if (contest.type === 'candidate') {
      return {
        candidates: contest.candidates.map(() => 0),
        writeIns: [],
      }
    } else {
      // `as Contest` is needed because TS knows 'yesno' and 'candidate' are the
      // only valid values and so infers `contest` is type `never`, and we want
      // to fail loudly in this situation.
      throw new Error(`unexpected contest type: ${(contest as Contest).type}`)
    }
  })

export default {
  getBallotStyle,
  getContests,
  getPartyPrimaryAdjectiveFromBallotStyle,
  getPrecinctById,
  getZeroTally,
}
