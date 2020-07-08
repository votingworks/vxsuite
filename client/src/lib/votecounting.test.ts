import { Candidate, Election } from '@votingworks/ballot-encoder'

import * as path from 'path'
import { promises as fs } from 'fs'

import find from '../utils/find'
import { parseCVRs, fullTallyVotes } from './votecounting'

const fixturesPath = path.join(__dirname, '../../test/fixtures')
const electionFilePath = path.join(fixturesPath, 'election.json')
const cvrFilePath = path.join(fixturesPath, 'CVRs.txt')

test('tabulating a set of CVRs gives expected output', async () => {
  // get the election
  const election = JSON.parse(
    (await fs.readFile(electionFilePath)).toString('utf-8')
  ) as Election

  // get the CVRs
  const cvrsFileContents = (await fs.readFile(cvrFilePath)).toString('utf-8')
  const castVoteRecords = parseCVRs(cvrsFileContents)

  // tabulate it
  const fullTally = fullTallyVotes({ election, castVoteRecords })

  expect(fullTally).toMatchSnapshot()

  // some specific tallies checked by hand
  // spot-checked the following:
  // - Jackie Chan, 679 bubbles, of which 4 are overvotes --> 675
  // - Neil Armstrong, 1139 bubbles, of which 5 are overvotes --> 1134
  // - 149 write-ins

  const presidentTallies = find(
    fullTally.overallTally.contestTallies,
    (contestTally) => contestTally.contest.id === 'president'
  )
  const jackieChanTally = find(
    presidentTallies.tallies,
    (contestOptionTally) =>
      (contestOptionTally.option as Candidate).id === 'jackie-chan'
  )
  expect(jackieChanTally.tally).toBe(675)

  const repDistrict18Tallies = find(
    fullTally.overallTally.contestTallies,
    (contestTally) => contestTally.contest.id === 'representative-district-18'
  )
  const neilArmstrongTally = find(
    repDistrict18Tallies.tallies,
    (contestOptionTally) =>
      (contestOptionTally.option as Candidate).id === 'neil-armstrong'
  )
  expect(neilArmstrongTally.tally).toBe(1134)
})
