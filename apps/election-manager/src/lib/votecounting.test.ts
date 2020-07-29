/* eslint-disable @typescript-eslint/ban-ts-ignore */
import {
  Candidate,
  parseElection,
  electionSample,
  Election,
} from '@votingworks/ballot-encoder'

import * as path from 'path'
import { promises as fs } from 'fs'

import find from '../utils/find'
import {
  parseCVRs,
  fullTallyVotes,
  getOvervotePairTallies,
} from './votecounting'
import { CastVoteRecord } from '../config/types'

const fixturesPath = path.join(__dirname, '../../test/fixtures')
const electionFilePath = path.join(fixturesPath, 'election.json')
const cvrFilePath = path.join(fixturesPath, 'CVRs.txt')

function parseCVRsAndAssertSuccess(
  cvrsFileContents: string,
  election: Election
): CastVoteRecord[] {
  return [...parseCVRs(cvrsFileContents, election)].map(({ cvr, errors }) => {
    expect({ cvr, errors }).toEqual({ cvr, errors: [] })
    return cvr
  })
}

test('tabulating a set of CVRs gives expected output', async () => {
  // get the election
  const election = parseElection(
    JSON.parse((await fs.readFile(electionFilePath)).toString('utf-8'))
  )

  // get the CVRs
  const cvrsFileContents = (await fs.readFile(cvrFilePath)).toString('utf-8')
  const castVoteRecords = parseCVRsAndAssertSuccess(cvrsFileContents, election)

  // tabulate it
  const fullTally = fullTallyVotes({ election, castVoteRecords })

  expect(fullTally).toMatchSnapshot()

  // some specific tallies checked by hand

  // - Jackie Chan, 1380 bubbles, of which 8 are overvotes --> 1372
  const presidentTallies = find(
    fullTally.overallTally.contestTallies,
    (contestTally) => contestTally.contest.id === 'president'
  )
  const jackieChanTally = find(
    presidentTallies.tallies,
    (contestOptionTally) =>
      (contestOptionTally.option as Candidate).id === 'jackie-chan'
  )
  expect(jackieChanTally.tally).toBe(1372)

  // - Neil Armstrong, 2207 bubbles, of which 10 are overvotes --> 2197
  const repDistrict18Tallies = find(
    fullTally.overallTally.contestTallies,
    (contestTally) => contestTally.contest.id === 'representative-district-18'
  )
  const neilArmstrongTally = find(
    repDistrict18Tallies.tallies,
    (contestOptionTally) =>
      (contestOptionTally.option as Candidate).id === 'neil-armstrong'
  )
  expect(neilArmstrongTally.tally).toBe(2197)

  // sum up all the write-ins across all questions
  // 262 bubbles filled out, of which 2 are overvotes --> 260 write-ins
  const candidateTallies = fullTally.overallTally.contestTallies.filter(
    (contestTally) => contestTally.contest.type === 'candidate'
  )

  const numWriteIns = candidateTallies.reduce(
    (overallSum, contestTally) =>
      overallSum +
      contestTally.tallies
        .filter(
          (optionTally) => (optionTally.option as Candidate).id === '__write-in'
        )
        .reduce((contestSum, optionTally) => contestSum + optionTally.tally, 0),
    0
  )

  expect(numWriteIns).toBe(260)
})

test('overvote report', async () => {
  // get the election
  const election = parseElection(
    JSON.parse((await fs.readFile(electionFilePath)).toString('utf-8'))
  )

  // get the CVRs
  const cvrsFileContents = (await fs.readFile(cvrFilePath)).toString('utf-8')
  const castVoteRecords = parseCVRsAndAssertSuccess(cvrsFileContents, election)

  const pairTallies = getOvervotePairTallies({ election, castVoteRecords })
  expect(pairTallies).toMatchSnapshot()
})

test('parsing CVRs flags when a precinct ID in a CVR is not present in the election definition', () => {
  const cvr: CastVoteRecord = {
    _ballotStyleId: '12',
    _precinctId: 'not real',
    _ballotId: 'abc',
    _scannerId: 'scanner-1',
    _testBallot: false,
  }
  expect([...parseCVRs(JSON.stringify(cvr), electionSample)]).toEqual([
    {
      cvr,
      errors: ["Precinct 'not real' in CVR is not in the election definition"],
      lineNumber: 1,
    },
  ])
})

test('parsing CVRs flags when a ballot style ID in a CVR is not present in the election definition', () => {
  const cvr: CastVoteRecord = {
    _ballotStyleId: '123',
    _precinctId: '23',
    _ballotId: 'abc',
    _scannerId: 'scanner-1',
    _testBallot: false,
    _locales: { primary: 'en-US', secondary: 'es-US' },
  }
  expect([...parseCVRs(JSON.stringify(cvr), electionSample)]).toEqual([
    {
      cvr,
      errors: ["Ballot style '123' in CVR is not in the election definition"],
      lineNumber: 1,
    },
  ])
})

test('parsing CVRs flags when a contest ID in a CVR is not present in the election definition', () => {
  const cvr: CastVoteRecord = {
    _ballotStyleId: '12',
    _precinctId: '23',
    _ballotId: 'abc',
    _scannerId: 'scanner-1',
    _testBallot: false,
    'not a contest': [],
  }
  expect([...parseCVRs(JSON.stringify(cvr), electionSample)]).toEqual([
    {
      cvr,
      errors: [
        "Contest 'not a contest' in CVR is not in the election definition or is not a valid contest for ballot style '12'",
      ],
      lineNumber: 1,
    },
  ])
})

test('parsing CVRs flags when test ballot flag is not a boolean', () => {
  const cvr: CastVoteRecord = {
    _ballotStyleId: '12',
    _precinctId: '23',
    _ballotId: 'abc',
    _scannerId: 'scanner-1',
    // @ts-ignore
    _testBallot: 'false',
  }
  expect([...parseCVRs(JSON.stringify(cvr), electionSample)]).toEqual([
    {
      cvr,
      errors: [
        "CVR test ballot flag must be true or false, got 'false' (string, not boolean)",
      ],
      lineNumber: 1,
    },
  ])
})

test('parsing CVRs flags when page number is set but not a number', () => {
  const cvr: CastVoteRecord = {
    _ballotStyleId: '12',
    _precinctId: '23',
    _ballotId: 'abc',
    _scannerId: 'scanner-1',
    _testBallot: false,
    // @ts-ignore
    _pageNumber: '99',
  }
  expect([...parseCVRs(JSON.stringify(cvr), electionSample)]).toEqual([
    {
      cvr,
      errors: [
        "Page number in CVR must be a number if it is set, got '99' (string, not number)",
      ],
      lineNumber: 1,
    },
  ])
})

test('parsing CVRs flags when ballot ID is not a string', () => {
  const cvr: CastVoteRecord = {
    _ballotStyleId: '12',
    _precinctId: '23',
    // @ts-ignore
    _ballotId: 44,
    _scannerId: 'scanner-1',
    _testBallot: false,
  }
  expect([...parseCVRs(JSON.stringify(cvr), electionSample)]).toEqual([
    {
      cvr,
      errors: [
        "Ballot ID in CVR must be a string, got '44' (number, not string)",
      ],
      lineNumber: 1,
    },
  ])
})

test('parsing CVRs flags when scanner ID is not a string', () => {
  const cvr: CastVoteRecord = {
    _ballotStyleId: '12',
    _precinctId: '23',
    _ballotId: 'abc',
    // @ts-ignore
    _scannerId: false,
    _testBallot: false,
  }
  expect([...parseCVRs(JSON.stringify(cvr), electionSample)]).toEqual([
    {
      cvr,
      errors: [
        "Scanner ID in CVR must be a string, got 'false' (boolean, not string)",
      ],
      lineNumber: 1,
    },
  ])
})

test('parsing CVRs flags when locale is not well formed', () => {
  const cvr: CastVoteRecord = {
    _ballotStyleId: '12',
    _precinctId: '23',
    _ballotId: 'abc',
    _scannerId: 'scanner-1',
    _testBallot: false,
    // @ts-ignore
    _locales: {},
  }
  expect([...parseCVRs(JSON.stringify(cvr), electionSample)]).toEqual([
    {
      cvr,
      errors: [
        "Locale in CVR must be a locale object with primary and optional secondary locales, got '{}'",
      ],
      lineNumber: 1,
    },
  ])
})
