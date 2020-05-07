import { Election, BallotStyle } from '@votingworks/ballot-encoder'

export const getContests = ({
  ballotStyle,
  election,
}: {
  ballotStyle: BallotStyle
  election: Election
}) =>
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
  ballotStyleId,
  election,
}: {
  ballotStyleId: string
  election: Election
}) => election.ballotStyles.find((bs) => bs.id === ballotStyleId) as BallotStyle

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
