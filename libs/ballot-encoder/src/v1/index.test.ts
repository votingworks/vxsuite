import { BitWriter } from '../bits'
import { electionSample as election, getContests, vote } from '../election'
import {
  decodeBallot,
  detect,
  encodeBallot,
  MAXIMUM_WRITE_IN_LENGTH,
  WriteInEncoding,
  Prelude,
} from './index'
import * as v0 from '../v0'

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
  }
  const encodedBallot = new BitWriter()
    // prelude + version number
    .writeString('VX', { includeLength: false })
    .writeUint8(1)
    // ballot style id
    .writeString('12')
    // precinct id
    .writeString('23')
    // vote roll call only, no vote data
    .writeBoolean(...contests.map(() => false))
    // ballot Id
    .writeString('abcde')
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
  }
  const encodedBallot = new BitWriter()
    // prelude + version number
    .writeString('VX', { includeLength: false })
    .writeUint8(1)
    // ballot style id
    .writeString('12')
    // precinct id
    .writeString('23')
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
    // ballot Id
    .writeString('abcde')
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
  }
  const encodedBallot = new BitWriter()
    // prelude + version number
    .writeString('VX', { includeLength: false })
    .writeUint8(1)
    // ballot style id
    .writeString('12')
    // precinct id
    .writeString('23')
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
    // ballot Id
    .writeString('abcde')
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
  }
  const encodedBallot = new BitWriter()
    // prelude + version number
    .writeString('VX', { includeLength: false })
    .writeUint8(1)
    // ballot style id
    .writeString('12')
    // precinct id
    .writeString('23')
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
    // ballot Id
    .writeString('abcde')
    .toUint8Array()

  expect(encodeBallot(ballot)).toEqualBits(encodedBallot)
  expect(decodeBallot(election, encodedBallot)).toEqual(ballot)
})
