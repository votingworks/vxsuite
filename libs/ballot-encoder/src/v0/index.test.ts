import {
  BallotType,
  CandidateContest,
  electionSample as election,
  getContests,
  vote,
} from '../election'
import * as v1 from '../v1'
import {
  decodeBallot,
  decodeBallotFromString,
  detect,
  detectString,
  encodeBallot,
  encodeBallotAsString,
} from './index'

test('can detect an encoded v0 ballot', () => {
  expect(
    detectString(
      '12.23.0|2|3|2|4|1|0|2|5,3,6,0|W||2,0,W|1|1|0|1|1|0|1|1.Ei5PXq7xbSJWHrF1dNRsjg'
    )
  ).toBe(true)
  expect(detectString('a.b.c.d')).toBe(true)
  expect(detectString('a..c.d')).toBe(true)
  expect(detectString('a.c.d')).toBe(false)
  expect(detectString('')).toBe(false)
  expect(detectString('a.b.c.d.e')).toBe(false)
})

test('does not detect a v1 buffer as v0', () => {
  const ballotStyle = election.ballotStyles[0]
  const precinct = election.precincts[0]
  const contests = getContests({ election, ballotStyle })
  const votes = vote(contests, {})
  const ballotId = 'abcde'
  const ballot = {
    election,
    ballotId,
    ballotStyle,
    precinct,
    votes,
    isTestBallot: false,
    ballotType: BallotType.Standard,
  }

  expect(detect(v1.encodeBallot(ballot))).toBe(false)
})

test('does not detect if the check throws', () => {
  const decode = jest
    .spyOn(TextDecoder.prototype, 'decode')
    .mockImplementation(() => {
      throw new Error()
    })

  try {
    expect(detect(Uint8Array.of())).toBe(false)
  } finally {
    decode.mockRestore()
  }
})

test('encodes & decodes with Uint8Array as the standard encoding interface', () => {
  const ballotStyle = election.ballotStyles[0]
  const precinct = election.precincts[0]
  const contests = getContests({ election, ballotStyle })
  const votes = vote(contests, {})
  const ballotId = 'abcde'
  const ballot = {
    election,
    ballotId,
    ballotStyle,
    precinct,
    votes,
    isTestBallot: false,
    ballotType: BallotType.Standard,
  }

  expect(decodeBallot(election, encodeBallot(ballot))).toEqual(ballot)
})

test('encodes & decodes empty votes', () => {
  const ballotStyle = election.ballotStyles[0]
  const precinct = election.precincts[0]
  const contests = getContests({ election, ballotStyle })
  const votes = vote(contests, {})
  const ballotId = 'abcde'
  const ballot = {
    election,
    ballotId,
    ballotStyle,
    precinct,
    votes,
    isTestBallot: false,
    ballotType: BallotType.Standard,
  }
  const encodedBallot = '12.23.|||||||||||||||||||.abcde'

  expect(encodeBallotAsString(ballot)).toEqual(encodedBallot)
  expect(decodeBallotFromString(election, encodedBallot)).toEqual(ballot)
})

test('encodes & decodes yesno votes', () => {
  const ballotStyle = election.ballotStyles[0]
  const contests = getContests({ ballotStyle, election })
  const precinct = election.precincts[0]
  const yesnos = contests.filter((contest) => contest.type === 'yesno')!
  const votes = vote(contests, {
    [yesnos[0].id]: 'yes',
    [yesnos[1].id]: 'no',
  })
  const ballotId = 'abcde'
  const ballot = {
    election,
    ballotId,
    ballotStyle,
    precinct,
    votes,
    isTestBallot: false,
    ballotType: BallotType.Standard,
  }
  const encodedBallot = '12.23.||||||||||||1|0||||||.abcde'

  expect(encodeBallotAsString(ballot)).toEqual(encodedBallot)
  expect(decodeBallotFromString(election, encodedBallot)).toEqual(ballot)
})

test('encodes & decodes candidate votes', () => {
  const ballotStyle = election.ballotStyles[0]
  const contests = getContests({ ballotStyle, election })
  const precinct = election.precincts[0]
  const contest = contests.find(
    (c) => c.type === 'candidate'
  ) as CandidateContest
  const votes = vote(contests, {
    [contest.id]: contest.candidates.slice(0, 2),
  })
  const ballotId = 'abcde'
  const ballot = {
    election,
    ballotId,
    ballotStyle,
    precinct,
    votes,
    isTestBallot: false,
    ballotType: BallotType.Standard,
  }
  const encodedBallot = '12.23.0,1|||||||||||||||||||.abcde'

  expect(encodeBallotAsString(ballot)).toEqual(encodedBallot)
  expect(decodeBallotFromString(election, encodedBallot)).toEqual(ballot)
})

test('encodes write-ins as `W`', () => {
  const ballotStyle = election.ballotStyles[0]
  const contests = getContests({ ballotStyle, election })
  const precinct = election.precincts[0]
  const contest = contests.find(
    (c) => c.type === 'candidate'
  ) as CandidateContest
  const votes = vote(contests, {
    [contest.id]: [
      { name: 'MICKEY MOUSE', isWriteIn: true, id: 'write-in__MICKEY MOUSE' },
    ],
  })
  const ballotId = 'abcde'
  const ballot = {
    election,
    ballotId,
    ballotStyle,
    precinct,
    votes,
    isTestBallot: false,
    ballotType: BallotType.Standard,
  }
  const encodedBallot = '12.23.W|||||||||||||||||||.abcde'

  expect(encodeBallotAsString(ballot)).toEqual(encodedBallot)

  expect(decodeBallotFromString(election, encodedBallot)).toEqual({
    ...ballot,
    // v0 can't fully round-trip write-ins: we lose the actual name
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
    // v0 does not encode whether a ballot is a test ballot
    isTestBallot: false,
    // v0 does not encode ballot type
    ballotType: BallotType.Standard,
  })
})

test('cannot encode a yesno contest with an invalid value', () => {
  const ballotStyle = election.ballotStyles[0]
  const contests = getContests({ ballotStyle, election })
  const precinct = election.precincts[0]
  const yesnos = contests.filter((contest) => contest.type === 'yesno')!
  const votes = vote(contests, {
    [yesnos[0].id]: 'YEP',
  })
  const ballotId = 'abcde'
  const ballot = {
    election,
    ballotId,
    ballotStyle,
    precinct,
    votes,
    isTestBallot: false,
    ballotType: BallotType.Standard,
  }

  expect(() => encodeBallot(ballot)).toThrowError(
    'cannot encode yesno vote, expected "no" or "yes" but got "YEP"'
  )
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
  }).toThrowError(
    'cannot decode yesno vote in contest "judicial-elmer-hull", expected "0" or "1" but got "W"'
  )
})

test('cannot decode a ballot with a negative candidate index', () => {
  expect(() => {
    decodeBallotFromString(election, '12.23.|-1||||||||||||||||||.abcde')
  }).toThrowError(
    'expected candidate index in contest "senator" to be in range [0, 7) but got "-1"'
  )
})

test('cannot decode a ballot with a candidate index out of bounds', () => {
  expect(() => {
    decodeBallotFromString(election, '12.23.|7||||||||||||||||||.abcde')
  }).toThrowError(
    'expected candidate index in contest "senator" to be in range [0, 7) but got "7"'
  )
})

test('cannot decode a ballot that is missing a ballot id', () => {
  expect(() => {
    decodeBallotFromString(election, '12.23.|||||||||||||||||||')
  }).toThrowError(
    'ballot data is malformed, expected data in this format: «ballot style id».«precinct id».«encoded votes».«ballot id»'
  )
})
