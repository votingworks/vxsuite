import { decodeBallot, detect, encodeBallot, EncoderVersion, v0, v1 } from '.'
import {
  BallotType,
  CompletedBallot,
  electionSample as election,
  getContests,
  vote,
} from './election'

test('exports v0 encoding', () => {
  expect(typeof v0.encodeBallot).toBe('function')
  expect(typeof v0.decodeBallot).toBe('function')
  expect(typeof v0.detect).toBe('function')
})

test('exports v1 encoding', () => {
  expect(typeof v1.encodeBallot).toBe('function')
  expect(typeof v1.decodeBallot).toBe('function')
  expect(typeof v1.detect).toBe('function')
})

test('encodes with v1 by default', () => {
  const ballotStyle = election.ballotStyles[0]
  const precinct = election.precincts[0]
  const contests = getContests({ election, ballotStyle })
  const votes = vote(contests, {})
  const ballotId = 'abcde'
  const ballot: CompletedBallot = {
    ballotId,
    ballotStyle,
    precinct,
    votes,
    isTestMode: false,
    ballotType: BallotType.Standard,
  }

  expect(detect(encodeBallot(election, ballot))).toEqual(EncoderVersion.v1)
})

test('can encode by version number', () => {
  const ballotStyle = election.ballotStyles[0]
  const precinct = election.precincts[0]
  const contests = getContests({ election, ballotStyle })
  const votes = vote(contests, {})
  const ballotId = 'abcde'
  const ballot: CompletedBallot = {
    ballotId,
    ballotStyle,
    precinct,
    votes,
    isTestMode: false,
    ballotType: BallotType.Standard,
  }

  expect(encodeBallot(election, ballot, EncoderVersion.v0)).toEqual(
    v0.encodeBallot(election, ballot)
  )

  expect(encodeBallot(election, ballot, EncoderVersion.v1)).toEqual(
    v1.encodeBallot(election, ballot)
  )
})

test('encoding with an invalid encoder version is an error', () => {
  expect(() =>
    encodeBallot(election, {} as CompletedBallot, 99 as EncoderVersion)
  ).toThrowError('unexpected encoder version: 99')
})

test('can decode specifying v0', () => {
  const ballotStyle = election.ballotStyles[0]
  const precinct = election.precincts[0]
  const contests = getContests({ election, ballotStyle })
  const votes = vote(contests, {})
  const ballotId = 'abcde'
  const ballot: CompletedBallot = {
    ballotId,
    ballotStyle,
    precinct,
    votes,
    isTestMode: false,
    ballotType: BallotType.Standard,
  }

  expect(
    decodeBallot(election, v0.encodeBallot(election, ballot), EncoderVersion.v0)
  ).toEqual({
    version: EncoderVersion.v0,
    ballot,
  })
})

test('can decode specifying v1', () => {
  const ballotStyle = election.ballotStyles[0]
  const precinct = election.precincts[0]
  const contests = getContests({ election, ballotStyle })
  const votes = vote(contests, {})
  const ballotId = 'abcde'
  const ballot: CompletedBallot = {
    ballotId,
    ballotStyle,
    precinct,
    votes,
    isTestMode: false,
    ballotType: BallotType.Standard,
  }

  expect(
    decodeBallot(election, v1.encodeBallot(election, ballot), EncoderVersion.v1)
  ).toEqual({ version: EncoderVersion.v1, ballot })
})

test('can decode and automatically detect the right version', () => {
  const ballotStyle = election.ballotStyles[0]
  const precinct = election.precincts[0]
  const contests = getContests({ election, ballotStyle })
  const votes = vote(contests, {})
  const ballotId = 'abcde'
  const ballot: CompletedBallot = {
    ballotId,
    ballotStyle,
    precinct,
    votes,
    isTestMode: false,
    ballotType: BallotType.Standard,
  }

  expect(decodeBallot(election, v0.encodeBallot(election, ballot))).toEqual({
    version: EncoderVersion.v0,
    ballot,
  })
  expect(decodeBallot(election, v1.encodeBallot(election, ballot))).toEqual({
    version: EncoderVersion.v1,
    ballot,
  })
})

test('fails to decode automatically if none of the existing decoders match', () => {
  expect(() => decodeBallot(election, Uint8Array.of())).toThrowError(
    'no ballot decoder was able to handle this encoded ballot'
  )
})

test('can detect v0 encoding', () => {
  const ballotStyle = election.ballotStyles[0]
  const precinct = election.precincts[0]
  const contests = getContests({ election, ballotStyle })
  const votes = vote(contests, {})
  const ballotId = 'abcde'
  const ballot: CompletedBallot = {
    ballotId,
    ballotStyle,
    precinct,
    votes,
    isTestMode: false,
    ballotType: BallotType.Standard,
  }

  expect(detect(v0.encodeBallot(election, ballot))).toEqual(EncoderVersion.v0)
})
