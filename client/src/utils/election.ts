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

const precinctBallotStyles = {
  'precinct-1': {
    'ballot-style-1': ['mayor-contest', 'proposition-r'],
  },
}

const ballotStylePrecinct = {
  'precinct-1': {
    'ballot-style-1': ['mayor-contest', 'proposition-r'],
  },
}

const ballots = [
  {
    precinctId: '1',
    ballotStyle: '1',
    contestIds: ['mayor-contest', 'proposition-r'],
  },
]
