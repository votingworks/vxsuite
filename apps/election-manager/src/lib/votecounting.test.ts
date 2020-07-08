import { Candidate, parseElection } from '@votingworks/ballot-encoder'

import * as path from 'path'
import { promises as fs } from 'fs'

import find from '../utils/find'
import {
  parseCVRs,
  fullTallyVotes,
  getOvervotePairTallies,
} from './votecounting'

const fixturesPath = path.join(__dirname, '../../test/fixtures')
const electionFilePath = path.join(fixturesPath, 'election.json')
const cvrFilePath = path.join(fixturesPath, 'CVRs.txt')

test('tabulating a set of CVRs gives expected output', async () => {
  // get the election
  const election = parseElection(
    JSON.parse((await fs.readFile(electionFilePath)).toString('utf-8'))
  )

  // get the CVRs
  const cvrsFileContents = (await fs.readFile(cvrFilePath)).toString('utf-8')
  const castVoteRecords = parseCVRs(cvrsFileContents)

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
  const castVoteRecords = parseCVRs(cvrsFileContents)

  const pairTallies = getOvervotePairTallies({ election, castVoteRecords })
  expect(pairTallies).toMatchSnapshot()
})
