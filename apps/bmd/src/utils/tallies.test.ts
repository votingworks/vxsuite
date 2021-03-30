import { join } from 'path'
import { CandidateContest } from '@votingworks/types'
import { loadElectionDefinition } from '@votingworks/fixtures'

import { calculateTally, combineTallies } from './tallies'
import { getZeroTally } from './election'

const electionSampleDefinition = loadElectionDefinition(
  join(__dirname, '../data/electionSample.json')
)

const { election } = electionSampleDefinition

const getIdxForContestId = (contestId: string) => {
  return election.contests.findIndex((c) => c.id === contestId)
}

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
        writeIns: 0,
        undervotes: contest.seats,
        ballotsCast: 1,
      }
      expect(tally[contestIdx]).toEqual(expectedResults)
    } else if (contest.type === 'yesno') {
      expect(tally[contestIdx]).toEqual({
        yes: 0,
        no: 0,
        undervotes: 1,
        ballotsCast: 1,
      })
    } else if (contest.type === 'ms-either-neither') {
      expect(tally[contestIdx]).toEqual({
        eitherOption: 0,
        neitherOption: 0,
        eitherNeitherUndervotes: 1,
        firstOption: 0,
        secondOption: 0,
        pickOneUndervotes: 1,
        ballotsCast: 1,
      })
    }
    contestIdx += 1
  })
})

test('adds vote to tally as expected', () => {
  const contestId = 'primary-constitution-head-of-party'
  const sampleContest = electionSampleDefinition.election.contests.find(
    (c): c is CandidateContest => c.id === contestId && c.type === 'candidate'
  )
  const alice = sampleContest!.candidates.find((c) => c.id === 'alice')!
  const bob = sampleContest!.candidates.find((c) => c.id === 'bob')!
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
        writeIns: 0,
        undervotes: 0,
        ballotsCast: 1,
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
        writeIns: 0,
        undervotes: 0,
        ballotsCast: 2,
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
        writeIns: 0,
        undervotes: 1,
        ballotsCast: 3,
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

  expect(tally[getIdxForContestId('president')]).toEqual({
    candidates: [0, 0, 1, 0, 0, 0],
    writeIns: 0,
    undervotes: 0,
    ballotsCast: 1,
  })
  expect(tally[getIdxForContestId('senator')]).toEqual({
    candidates: [0, 0, 0, 0, 0, 0, 0],
    writeIns: 0,
    undervotes: 1,
    ballotsCast: 1,
  })
  expect(tally[getIdxForContestId('representative-district-6')]).toEqual({
    candidates: [1, 0, 0, 0, 0],
    writeIns: 0,
    undervotes: 0,
    ballotsCast: 1,
  })
  expect(tally[getIdxForContestId('county-commissioners')]).toEqual({
    candidates: [1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    writeIns: 0,
    undervotes: 2,
    ballotsCast: 1,
  })
  expect(tally[getIdxForContestId('county-registrar-of-wills')]).toEqual({
    candidates: [0],
    writeIns: 1,
    undervotes: 0,
    ballotsCast: 1,
  })
  expect(tally[getIdxForContestId('judicial-robert-demergue')]).toEqual({
    yes: 1,
    no: 0,
    undervotes: 0,
    ballotsCast: 1,
  })
  expect(tally[getIdxForContestId('judicial-elmer-hull')]).toEqual({
    yes: 0,
    no: 1,
    undervotes: 0,
    ballotsCast: 1,
  })
  expect(tally[getIdxForContestId('question-a')]).toEqual({
    yes: 0,
    no: 0,
    undervotes: 1,
    ballotsCast: 1,
  })
  expect(tally[getIdxForContestId('measure-420')]).toEqual({
    eitherOption: 1,
    neitherOption: 0,
    eitherNeitherUndervotes: 0,
    firstOption: 0,
    secondOption: 0,
    pickOneUndervotes: 1,
    ballotsCast: 1,
  })
})

test('can combine contest tallies as expected', () => {
  const tally1 = getZeroTally(election)
  const tally2 = getZeroTally(election)

  // Modify the president candidate contest which is the first in the array.
  tally1[getIdxForContestId('president')] = {
    candidates: [11, 2, 5, 1, 0, 0],
    undervotes: 3,
    writeIns: 10,
    ballotsCast: 32,
  }
  tally2[getIdxForContestId('president')] = {
    candidates: [3, 0, 2, 1, 5, 0],
    undervotes: 2,
    writeIns: 5,
    ballotsCast: 18,
  }

  // Modify a yes no contest
  tally1[getIdxForContestId('judicial-robert-demergue')] = {
    yes: 5,
    no: 17,
    undervotes: 3,
    ballotsCast: 25,
  }
  tally2[getIdxForContestId('judicial-robert-demergue')] = {
    yes: 3,
    no: 2,
    undervotes: 10,
    ballotsCast: 15,
  }

  // Modify an either neither contest
  tally1[getIdxForContestId('measure-420')] = {
    eitherOption: 3,
    neitherOption: 2,
    eitherNeitherUndervotes: 10,
    firstOption: 18,
    secondOption: 4,
    pickOneUndervotes: 3,
    ballotsCast: 40,
  }
  tally2[getIdxForContestId('measure-420')] = {
    eitherOption: 2,
    neitherOption: 3,
    eitherNeitherUndervotes: 10,
    firstOption: 2,
    secondOption: 16,
    pickOneUndervotes: 2,
    ballotsCast: 35,
  }

  const combinedTallies = combineTallies(election, tally1, tally2)

  expect(combinedTallies[getIdxForContestId('president')]).toEqual({
    candidates: [14, 2, 7, 2, 5, 0],
    undervotes: 5,
    writeIns: 15,
    ballotsCast: 50,
  })

  expect(
    combinedTallies[getIdxForContestId('judicial-robert-demergue')]
  ).toEqual({
    yes: 8,
    no: 19,
    undervotes: 13,
    ballotsCast: 40,
  })

  expect(combinedTallies[getIdxForContestId('measure-420')]).toEqual({
    eitherOption: 5,
    neitherOption: 5,
    eitherNeitherUndervotes: 20,
    firstOption: 20,
    secondOption: 20,
    pickOneUndervotes: 5,
    ballotsCast: 75,
  })

  // Everything else should still be a zero tally
  for (let i = 0; i < combinedTallies.length; i++) {
    // Don't check the contests we modified
    if (
      ![
        getIdxForContestId('president'),
        getIdxForContestId('judicial-robert-demergue'),
        getIdxForContestId('measure-420'),
      ].includes(i)
    ) {
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
  tally1[getIdxForContestId('president')] = {
    candidates: [0, 0, 0],
    undervotes: 0,
    writeIns: 0,
    ballotsCast: 0,
  }
  expect(() => {
    combineTallies(election, tally1, tally2)
  }).toThrowError()
})
