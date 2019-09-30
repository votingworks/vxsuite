import { BitWriter } from '../bits'
import { electionSample as election, getContests, vote } from '../election'
import * as v0 from '../v0'
import {
  decodeBallot,
  detect,
  encodeBallot,
  encodeBallotInto,
  MAXIMUM_WRITE_IN_LENGTH,
  Prelude,
  WriteInEncoding,
} from './index'

function falses(count: number): boolean[] {
  return new Array(count).fill(false)
}

test('can detect an encoded v1 buffer', () => {
  expect(detect(Uint8Array.of(...Prelude))).toBe(true)
  expect(detect(Uint8Array.of())).toBe(false)
  expect(detect(Uint8Array.of(0, ...Prelude))).toBe(false)
  expect(detect(Uint8Array.of(...Prelude.slice(0, -2)))).toBe(false)
})

test('does not detect a v0 buffer as v1', () => {
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
  }

  expect(detect(v0.encodeBallot(ballot))).toBe(false)
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
  }

  expect(decodeBallot(election, encodeBallot(ballot))).toEqual(ballot)
})

it('encodes & decodes empty votes correctly', () => {
  const ballotStyle = election.ballotStyles[0]
  const precinct = election.precincts[0]
  const contests = getContests({ ballotStyle, election })
  const votes = vote(contests, {})
  const ballotId = 'abcde'
  const ballot = {
    election,
    ballotId,
    ballotStyle,
    precinct,
    votes,
    isTestBallot: false,
  }
  const encodedBallot = new BitWriter()
    // prelude + version number
    .writeString('VX', { includeLength: false })
    .writeUint8(1)
    // ballot style id
    .writeString('12')
    // precinct id
    .writeString('23')
    // ballot Id
    .writeString('abcde')
    // vote roll call only, no vote data
    .writeBoolean(...contests.map(() => false))
    .toUint8Array()

  expect(encodeBallot(ballot)).toEqualBits(encodedBallot)
  expect(decodeBallot(election, encodedBallot)).toEqual(ballot)
})

it('encodes & decodes whether it is a test ballot', () => {
  const ballotStyle = election.ballotStyles[0]
  const precinct = election.precincts[0]
  const contests = getContests({ ballotStyle, election })
  const votes = vote(contests, {})
  const ballotId = 'abcde'
  const ballot = {
    election,
    ballotId,
    ballotStyle,
    precinct,
    votes,
    isTestBallot: true,
  }
  const encodedBallot = new BitWriter()
    // prelude + version number
    .writeString('VX', { includeLength: false })
    .writeUint8(1)
    // ballot style id
    .writeString('12')
    // precinct id
    .writeString('23')
    // ballot Id
    .writeString('abcde')
    // vote roll call only, no vote data
    .writeBoolean(...contests.map(() => false))
    // test ballot?
    .writeBoolean(true)
    .toUint8Array()

  expect(encodeBallot(ballot)).toEqualBits(encodedBallot)
  expect(decodeBallot(election, encodedBallot)).toEqual(ballot)
})

it('encodes & decodes yesno votes correctly', () => {
  const ballotStyle = election.ballotStyles[0]
  const precinct = election.precincts[0]
  const ballotId = 'abcde'
  const contests = getContests({ ballotStyle, election })
  const votes = vote(contests, {
    'judicial-robert-demergue': 'yes',
    'judicial-elmer-hull': 'yes',
    'question-a': 'yes',
    'question-b': 'no',
    'question-c': 'yes',
    'proposition-1': 'yes',
    'measure-101': 'no',
    '102': 'yes',
  })
  const ballot = {
    election,
    ballotId,
    ballotStyle,
    precinct,
    votes,
    isTestBallot: false,
  }
  const encodedBallot = new BitWriter()
    // prelude + version number
    .writeString('VX', { includeLength: false })
    .writeUint8(1)
    // ballot style id
    .writeString('12')
    // precinct id
    .writeString('23')
    // ballot Id
    .writeString('abcde')
    // vote roll call
    .writeBoolean(...contests.map(contest => contest.id in votes))
    // vote data
    .writeBoolean(true)
    .writeBoolean(true)
    .writeBoolean(true)
    .writeBoolean(false)
    .writeBoolean(true)
    .writeBoolean(true)
    .writeBoolean(false)
    .writeBoolean(true)
    .toUint8Array()

  expect(encodeBallot(ballot)).toEqualBits(encodedBallot)
  expect(decodeBallot(election, encodedBallot)).toEqual(ballot)
})

it('encodes & decodes candidate choice votes correctly', () => {
  const ballotStyle = election.ballotStyles[0]
  const precinct = election.precincts[0]
  const ballotId = 'abcde'
  const contests = getContests({ ballotStyle, election })
  const votes = vote(contests, {
    president: 'barchi-hallaren',
    senator: 'weiford',
    'representative-district-6': 'plunkard',
    governor: 'franz',
    'lieutenant-governor': 'norberg',
    'secretary-of-state': 'shamsi',
    'state-senator-district-31': 'shiplett',
    'state-assembly-district-54': 'solis',
    'county-commissioners': 'argent',
    'county-registrar-of-wills': 'ramachandrani',
    'city-mayor': 'white',
    'city-council': 'eagle',
  })
  const ballot = {
    election,
    ballotId,
    ballotStyle,
    precinct,
    votes,
    isTestBallot: false,
  }
  const encodedBallot = new BitWriter()
    // prelude + version number
    .writeString('VX', { includeLength: false })
    .writeUint8(1)
    // ballot style id
    .writeString('12')
    // precinct id
    .writeString('23')
    // ballot Id
    .writeString('abcde')
    // vote roll call
    .writeBoolean(...contests.map(contest => contest.id in votes))
    // vote data
    // - president (barchi-hallaren)
    .writeBoolean(true, ...falses(5))
    // - senator (weiford)
    .writeBoolean(true, ...falses(6))
    // - representative-district-6 (plunarkd)
    .writeBoolean(true, ...falses(4))
    // - governor (franz)
    .writeBoolean(true, ...falses(25))
    // - lieutenant-governor (norberg)
    .writeBoolean(true, ...falses(8))
    // - secretary-of-state (shamsi)
    .writeBoolean(true, false)
    // - state-senator-district-31 (shiplet)
    .writeBoolean(true)
    // - state-assembly-district-54 (solis)
    .writeBoolean(true, false, false)
    // - county-commissioners (argent)
    .writeBoolean(true, ...falses(14))
    // --- write-ins
    .writeUint(0, { max: 3 }) // 4 seats - 1 selection = 3 write-ins max
    // - county-registrar-of-wills (ramachandrani)
    .writeBoolean(true)
    // - city-mayor (white)
    .writeBoolean(true, false)
    // - city-council (eagle)
    .writeBoolean(true, ...falses(5))
    // --- write-ins
    .writeUint(0, { max: 2 }) // 3 seats - 1 selection = 2 write-ins max
    .toUint8Array()

  expect(encodeBallot(ballot)).toEqualBits(encodedBallot)
  expect(decodeBallot(election, encodedBallot)).toEqual(ballot)
})

it('encodes & decodes write-in votes correctly', () => {
  const ballotStyle = election.ballotStyles[0]
  const precinct = election.precincts[0]
  const contests = getContests({ ballotStyle, election })
  const votes = vote(contests, {
    'county-registrar-of-wills': [
      { id: 'write-in__MICKEY MOUSE', name: 'MICKEY MOUSE', isWriteIn: true },
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
  }
  const encodedBallot = new BitWriter()
    // prelude + version number
    .writeString('VX', { includeLength: false })
    .writeUint8(1)
    // ballot style id
    .writeString('12')
    // precinct id
    .writeString('23')
    // ballot Id
    .writeString('abcde')
    // vote roll call
    .writeBoolean(...contests.map(contest => contest.id in votes))
    // vote data
    // - county-registrar-of-wills (ramachandrani)
    .writeBoolean(false)
    // --- write-ins
    .writeUint(1, { max: 1 }) // 1 seat - 0 selections = 1 max write-in
    .writeString('MICKEY MOUSE', {
      encoding: WriteInEncoding,
      maxLength: MAXIMUM_WRITE_IN_LENGTH,
    })
    // test ballot?
    .writeBoolean(false)
    .toUint8Array()

  expect(encodeBallot(ballot)).toEqualBits(encodedBallot)
  expect(decodeBallot(election, encodedBallot)).toEqual(ballot)
})

test('cannot decode a ballot without the prelude', () => {
  const encodedBallot = new BitWriter()
    // prelude + version number
    .writeString('XV', { includeLength: false })
    .writeUint8(1)
    .toUint8Array()

  expect(() => decodeBallot(election, encodedBallot)).toThrowError(
    "expected leading prelude 'V' 'X' 0b00000001 but it was not found"
  )
})

test('cannot decode a ballot with a ballot style ID not in the election', () => {
  const encodedBallot = new BitWriter()
    // prelude + version number
    .writeString('VX', { includeLength: false })
    .writeUint8(1)
    // ballot style id
    .writeString('ZZZ')
    // precinct id
    .writeString('23')
    // ballot Id
    .writeString('abcde')
    .toUint8Array()

  expect(() => decodeBallot(election, encodedBallot)).toThrowError(
    'ballot style with id "ZZZ" could not be found, expected one of: 12, 5, 7C'
  )
})

test('cannot decode a ballot with a precinct ID not in the election', () => {
  const encodedBallot = new BitWriter()
    // prelude + version number
    .writeString('VX', { includeLength: false })
    .writeUint8(1)
    // ballot style id
    .writeString('12')
    // precinct id
    .writeString('ZZZ')
    // ballot Id
    .writeString('abcde')
    .toUint8Array()

  expect(() => decodeBallot(election, encodedBallot)).toThrowError(
    'precinct with id "ZZZ" could not be found, expected one of: 23, 21, 20'
  )
})

test('cannot decode a ballot that includes extra data at the end', () => {
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
  }

  const writer = new BitWriter()

  encodeBallotInto(ballot, writer)

  const corruptedBallot = writer.writeBoolean(true).toUint8Array()

  expect(() => decodeBallot(election, corruptedBallot)).toThrowError(
    'unexpected data found while reading padding, expected EOF'
  )
})

test('cannot decode a ballot that includes too much padding at the end', () => {
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
  }

  const writer = new BitWriter()

  encodeBallotInto(ballot, writer)

  const corruptedBallot = writer.writeUint8(0).toUint8Array()

  expect(() => decodeBallot(election, corruptedBallot)).toThrowError(
    'unexpected data found while reading padding, expected EOF'
  )
})
