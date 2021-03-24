import { CandidateContest, Election } from '@votingworks/types'

import { calculateTally, combineTallies } from './tallies'
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

test('can combine contest tallies as expected', () => {
  const tally1 = getZeroTally(election)
  const tally2 = getZeroTally(election)

  // Modify the president candidate contest which is the first in the array.
  tally1[0] = {
    candidates: [11, 2, 5, 1, 0, 0],
    undervotes: 3,
    writeIns: [
      { name: 'eevee', tally: 3 },
      { name: 'flareon', tally: 7 },
    ],
  }
  tally2[0] = {
    candidates: [3, 0, 2, 1, 5, 0],
    undervotes: 2,
    writeIns: [
      { name: 'eevee', tally: 2 },
      { name: 'jolteon', tally: 3 },
    ],
  }

  // Modify a yes no contest
  tally1[12] = {
    yes: 5,
    no: 17,
    undervotes: 3,
  }
  tally2[12] = {
    yes: 3,
    no: 2,
    undervotes: 10,
  }

  // Modify an either neither contest
  tally1[20] = {
    eitherOption: 3,
    neitherOption: 2,
    eitherNeitherUndervotes: 10,
    firstOption: 18,
    secondOption: 4,
    pickOneUndervotes: 3,
  }
  tally2[20] = {
    eitherOption: 2,
    neitherOption: 3,
    eitherNeitherUndervotes: 10,
    firstOption: 2,
    secondOption: 16,
    pickOneUndervotes: 2,
  }

  const combinedTallies = combineTallies(election, tally1, tally2)

  expect(combinedTallies[0]).toEqual({
    candidates: [14, 2, 7, 2, 5, 0],
    undervotes: 5,
    writeIns: [
      { name: 'eevee', tally: 5 },
      { name: 'flareon', tally: 7 },
      { name: 'jolteon', tally: 3 },
    ],
  })

  expect(combinedTallies[12]).toEqual({
    yes: 8,
    no: 19,
    undervotes: 13,
  })

  expect(combinedTallies[20]).toEqual({
    eitherOption: 5,
    neitherOption: 5,
    eitherNeitherUndervotes: 20,
    firstOption: 20,
    secondOption: 20,
    pickOneUndervotes: 5,
  })

  // Everything else should still be a zero tally
  for (let i = 0; i < combinedTallies.length; i++) {
    // Don't check the contests we modified
    if (![0, 12, 20].includes(i)) {
      expect(combinedTallies[i]).toEqual(tally1[i])
    }
  }
})

test('combineTallies throws error when given incompatible tallies', () => {
  const tally1 = getZeroTally(election)
  const tally2 = getZeroTally(election)

  // Expect an error when the number of contests does not match up from the election to tally1 and tally2
  expect(() => {
    combineTallies(election, tally1.slice(0, 15), tally2)
  }).toThrowError()
  expect(() => {
    combineTallies(election, tally1, tally2.slice(0, 10))
  }).toThrowError()
  expect(() => {
    combineTallies(election, tally1.slice(0, 10), tally2.slice(0, 10))
  }).toThrowError()

  // Expect an error when the number of candidates in a contest does not match up.
  tally1[0] = {
    candidates: [0, 0, 0],
    undervotes: 0,
    writeIns: [],
  }
  expect(() => {
    combineTallies(election, tally1, tally2)
  }).toThrowError()
})
