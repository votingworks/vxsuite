import {
  encodeBallotAsString,
  decodeBallotFromString,
  encodeBallot,
  decodeBallot,
} from './index'
import {
  VotesDict,
  getContests,
  CandidateContest,
  electionSample as election,
} from '../election'

test('encodes & decodes with Uint8Array as the standard encoding interface', () => {
  const ballotStyle = election.ballotStyles[0]
  const precinct = election.precincts[0]
  const votes: VotesDict = {}
  const ballotId = 'abcde'
  const ballot = {
    election,
    ballotId,
    ballotStyle,
    precinct,
    votes,
  }

  expect(decodeBallot(election, encodeBallot(ballot))).toEqual(ballot)
})

test('encodes & decodes empty votes', () => {
  const ballotStyle = election.ballotStyles[0]
  const precinct = election.precincts[0]
  const votes: VotesDict = {}
  const ballotId = 'abcde'
  const ballot = {
    election,
    ballotId,
    ballotStyle,
    precinct,
    votes,
  }
  const encodedBallot = '12.23.|||||||||||||||||||.abcde'

  expect(encodeBallotAsString(ballot)).toEqual(encodedBallot)
  expect(decodeBallotFromString(election, encodedBallot)).toEqual(ballot)
})

test('encodes & decodes yesno votes', () => {
  const ballotStyle = election.ballotStyles[0]
  const contests = getContests({ ballotStyle, election })
  const precinct = election.precincts[0]
  const yesnos = contests.filter(contest => contest.type === 'yesno')!
  const votes: VotesDict = {
    [yesnos[0].id]: 'yes',
    [yesnos[1].id]: 'no',
  }
  const ballotId = 'abcde'
  const ballot = {
    election,
    ballotId,
    ballotStyle,
    precinct,
    votes,
  }
  const encodedBallot = '12.23.||||||||||||1|0||||||.abcde'

  expect(encodeBallotAsString(ballot)).toEqual(encodedBallot)
  expect(decodeBallotFromString(election, encodedBallot)).toEqual(ballot)
})

test('encodes & decodes candidate votes', () => {
  const ballotStyle = election.ballotStyles[0]
  const contests = getContests({ ballotStyle, election })
  const precinct = election.precincts[0]
  const contest = contests.find(c => c.type === 'candidate') as CandidateContest
  const votes: VotesDict = {
    [contest.id]: contest.candidates.slice(0, 2),
  }
  const ballotId = 'abcde'
  const ballot = {
    election,
    ballotId,
    ballotStyle,
    precinct,
    votes,
  }
  const encodedBallot = '12.23.0,1|||||||||||||||||||.abcde'

  expect(encodeBallotAsString(ballot)).toEqual(encodedBallot)
  expect(decodeBallotFromString(election, encodedBallot)).toEqual(ballot)
})

test('encodes write-ins as `W`', () => {
  const ballotStyle = election.ballotStyles[0]
  const contests = getContests({ ballotStyle, election })
  const precinct = election.precincts[0]
  const contest = contests.find(c => c.type === 'candidate') as CandidateContest
  const votes: VotesDict = {
    [contest.id]: [
      { name: 'MICKEY MOUSE', isWriteIn: true, id: 'write-in__MICKEY MOUSE' },
    ],
  }
  const ballotId = 'abcde'
  const ballot = {
    election,
    ballotId,
    ballotStyle,
    precinct,
    votes,
  }
  const encodedBallot = '12.23.W|||||||||||||||||||.abcde'

  expect(encodeBallotAsString(ballot)).toEqual(encodedBallot)

  // v0 can't fully round-trip write-ins: we lose the actual name
  expect(decodeBallotFromString(election, encodedBallot)).toEqual({
    ...ballot,
    votes: {
      ...votes,
      [contest.id]: [
        {
          name: '',
          id: 'write-in__NOT RECORDED',
          isWriteIn: true,
        },
      ],
    },
  })
})

test('cannot decode a ballot with a ballot style id that does not exist', () => {
  expect(() => {
    decodeBallotFromString(election, '9999.23.|||||||||||||||||||.abcde')
  }).toThrowError('unable to find ballot style by id: 9999')
})

test('cannot decode a ballot with a precinct id that does not exist', () => {
  expect(() => {
    decodeBallotFromString(election, '12.9999.|||||||||||||||||||.abcde')
  }).toThrowError('unable to find precinct by id: 9999')
})

test('cannot decode a ballot with an unexpected number of votes', () => {
  expect(() => {
    decodeBallotFromString(election, '12.23.|||.abcde')
  }).toThrowError('found 4 vote(s), but expected 20 (one per contest)')
})

test('cannot decode a yesno vote that is not "0" or "1"', () => {
  expect(() => {
    decodeBallotFromString(election, '12.23.|||||||||||||W||||||.abcde')
  }).toThrowError('cannot decode yesno vote, expected "0" or "1" but got "W"')
})

test('cannot decode a ballot with a negative candidate index', () => {
  expect(() => {
    decodeBallotFromString(election, '12.23.|-1||||||||||||||||||.abcde')
  }).toThrowError('expected candidate index in [0, 7) but got: "-1"')
})

test('cannot decode a ballot with a candidate index out of bounds', () => {
  expect(() => {
    decodeBallotFromString(election, '12.23.|7||||||||||||||||||.abcde')
  }).toThrowError('expected candidate index in [0, 7) but got: "7"')
})

test('cannot decode a ballot that is missing a ballot id', () => {
  expect(() => {
    decodeBallotFromString(election, '12.23.|||||||||||||||||||')
  }).toThrowError(
    'ballot data is malformed, expected data in this format: «ballot id».«precinct id».«encoded votes».«ballot id»'
  )
})
