import { CandidateContest, Election } from '@votingworks/types'

import { calculateTally } from './tallies'
import { getZeroTally } from './election'

import electionSample from '../data/electionSample.json'

const election = electionSample as Election

test('counts missing votes counts as undervotes for appropriate ballot style', () => {
  const zeroTally = getZeroTally(election)
  const tally = calculateTally({
    election,
    tally: getZeroTally(election),
    votes: {},
    ballotStyleId: '12',
  })

  const contestIdsNotOnBallots = [
    'primary-constitution-head-of-party',
    'measure-666',
  ]
  let contestIdx = 0
  election.contests.forEach((contest) => {
    if (contestIdsNotOnBallots.includes(contest.id)) {
      expect(tally[contestIdx]).toEqual(zeroTally[contestIdx])
    } else if (contest.type === 'candidate') {
      const expectedResults = {
        candidates: contest.candidates.map(() => 0),
        writeIns: [],
        undervotes: contest.seats,
      }
      expect(tally[contestIdx]).toEqual(expectedResults)
    } else if (contest.type === 'yesno') {
      expect(tally[contestIdx]).toEqual({ yes: 0, no: 0, undervotes: 1 })
    } else if (contest.type === 'ms-either-neither') {
      expect(tally[contestIdx]).toEqual({
        eitherOption: 0,
        neitherOption: 0,
        eitherNeitherUndervotes: 1,
        firstOption: 0,
        secondOption: 0,
        pickOneUndervotes: 1,
      })
    }
    contestIdx += 1
  })
})

test('adds vote to tally as expected', () => {
  const contestId = 'primary-constitution-head-of-party'
  const sampleContest = electionSample.contests.find((c) => c.id === contestId)
  const alice = sampleContest!.candidates!.find((c) => c.id === 'alice')!
  const bob = sampleContest!.candidates!.find((c) => c.id === 'bob')!
  const zeroTally = getZeroTally(election)
  const tally1 = calculateTally({
    election,
    tally: zeroTally,
    votes: { 'primary-constitution-head-of-party': [alice] },
    ballotStyleId: '7C',
  })

  let contestIdx = 0
  election.contests.forEach((contest) => {
    if (contest.id !== contestId) {
      expect(tally1[contestIdx]).toEqual(zeroTally[contestIdx])
    } else {
      expect(tally1[contestIdx]).toEqual({
        candidates: [1, 0],
        writeIns: [],
        undervotes: 0,
      })
    }
    contestIdx += 1
  })

  const tally2 = calculateTally({
    election,
    tally: tally1,
    votes: { 'primary-constitution-head-of-party': [bob] },
    ballotStyleId: '7C',
  })

  contestIdx = 0
  election.contests.forEach((contest) => {
    if (contest.id !== contestId) {
      expect(tally2[contestIdx]).toEqual(zeroTally[contestIdx])
    } else {
      expect(tally2[contestIdx]).toEqual({
        candidates: [1, 1],
        writeIns: [],
        undervotes: 0,
      })
    }
    contestIdx += 1
  })

  const tally3 = calculateTally({
    election,
    tally: tally2,
    votes: { 'primary-constitution-head-of-party': [] },
    ballotStyleId: '7C',
  })

  contestIdx = 0
  election.contests.forEach((contest) => {
    if (contest.id !== contestId) {
      expect(tally3[contestIdx]).toEqual(zeroTally[contestIdx])
    } else {
      expect(tally3[contestIdx]).toEqual({
        candidates: [1, 1],
        writeIns: [],
        undervotes: 1,
      })
    }
    contestIdx += 1
  })
})

test('tallies votes across many contests appropriately', () => {
  const tally = calculateTally({
    election,
    tally: getZeroTally(election),
    votes: {
      president: [(election.contests[0] as CandidateContest).candidates[2]!],
      senator: [], // explicit undervote
      'representative-district-6': [
        (election.contests[2] as CandidateContest).candidates[0]!,
      ],
      'county-commissioners': [
        (election.contests[8] as CandidateContest).candidates[0]!,
        (election.contests[8] as CandidateContest).candidates[1]!,
      ], // 2 votes in a 4 seat contest
      'county-registrar-of-wills': [
        { id: 'write_in_vote', name: 'WRITE IN', isWriteIn: true },
      ], // write in
      'judicial-robert-demergue': ['yes'],
      'judicial-elmer-hull': ['no'],
      'question-a': [],
      '420A': ['yes'],
      '420B': [],
    },
    ballotStyleId: '12',
  })

  expect(tally[0]).toEqual({
    candidates: [0, 0, 1, 0, 0, 0],
    writeIns: [],
    undervotes: 0,
  })
  expect(tally[1]).toEqual({
    candidates: [0, 0, 0, 0, 0, 0, 0],
    writeIns: [],
    undervotes: 1,
  })
  expect(tally[2]).toEqual({
    candidates: [1, 0, 0, 0, 0],
    writeIns: [],
    undervotes: 0,
  })
  expect(tally[8]).toEqual({
    candidates: [1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    writeIns: [],
    undervotes: 2,
  })
  expect(tally[9]).toEqual({
    candidates: [0],
    writeIns: [{ name: 'WRITE IN', tally: 1 }],
    undervotes: 0,
  })
  expect(tally[12]).toEqual({
    yes: 1,
    no: 0,
    undervotes: 0,
  })
  expect(tally[13]).toEqual({
    yes: 0,
    no: 1,
    undervotes: 0,
  })
  expect(tally[14]).toEqual({
    yes: 0,
    no: 0,
    undervotes: 1,
  })
  expect(tally[20]).toEqual({
    eitherOption: 1,
    neitherOption: 0,
    eitherNeitherUndervotes: 0,
    firstOption: 0,
    secondOption: 0,
    pickOneUndervotes: 1,
  })
})
