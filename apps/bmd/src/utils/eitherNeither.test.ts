import { Election } from '@votingworks/types'

import { computeTallyForEitherNeitherContests } from './eitherNeither'
import { getZeroTally } from './election'

import electionSample from '../data/electionSample.json'

const election = electionSample as Election
const measure420Index = election.contests.findIndex(
  (c) => c.id === 'measure-420'
)
const zeroTally = getZeroTally(election)

test('counts first option without first answer', () => {
  const tally = computeTallyForEitherNeitherContests({
    election,
    tally: zeroTally,
    votes: {
      '420A': [],
      '420B': ['yes'],
    },
    contests: election.contests,
  })

  expect(tally[measure420Index]).toEqual({
    eitherOption: 0,
    neitherOption: 0,
    eitherNeitherUndervotes: 1,
    firstOption: 1,
    secondOption: 0,
    pickOneUndervotes: 0,
    ballotsCast: 1,
  })
})

test('counts second option without first answer', () => {
  const tally = computeTallyForEitherNeitherContests({
    election,
    tally: zeroTally,
    votes: {
      '420A': [],
      '420B': ['no'],
    },
    contests: election.contests,
  })

  expect(tally[measure420Index]).toEqual({
    eitherOption: 0,
    neitherOption: 0,
    eitherNeitherUndervotes: 1,
    firstOption: 0,
    secondOption: 1,
    pickOneUndervotes: 0,
    ballotsCast: 1,
  })
})

test('counts first option with either answer', () => {
  const tally = computeTallyForEitherNeitherContests({
    election,
    tally: zeroTally,
    votes: {
      '420A': ['yes'],
      '420B': ['yes'],
    },
    contests: election.contests,
  })

  expect(tally[measure420Index]).toEqual({
    eitherOption: 1,
    neitherOption: 0,
    eitherNeitherUndervotes: 0,
    firstOption: 1,
    secondOption: 0,
    pickOneUndervotes: 0,
    ballotsCast: 1,
  })
})

test('counts second option with either answer', () => {
  const tally = computeTallyForEitherNeitherContests({
    election,
    tally: zeroTally,
    votes: {
      '420A': ['yes'],
      '420B': ['no'],
    },
    contests: election.contests,
  })

  expect(tally[measure420Index]).toEqual({
    eitherOption: 1,
    neitherOption: 0,
    eitherNeitherUndervotes: 0,
    firstOption: 0,
    secondOption: 1,
    pickOneUndervotes: 0,
    ballotsCast: 1,
  })
})

test('counts first option with neither answer', () => {
  const tally = computeTallyForEitherNeitherContests({
    election,
    tally: zeroTally,
    votes: {
      '420A': ['no'],
      '420B': ['yes'],
    },
    contests: election.contests,
  })

  expect(tally[measure420Index]).toEqual({
    eitherOption: 0,
    neitherOption: 1,
    eitherNeitherUndervotes: 0,
    firstOption: 1,
    secondOption: 0,
    pickOneUndervotes: 0,
    ballotsCast: 1,
  })
})

test('counts second option with neither answer', () => {
  const tally = computeTallyForEitherNeitherContests({
    election,
    tally: zeroTally,
    votes: {
      '420A': ['no'],
      '420B': ['no'],
    },
    contests: election.contests,
  })

  expect(tally[measure420Index]).toEqual({
    eitherOption: 0,
    neitherOption: 1,
    eitherNeitherUndervotes: 0,
    firstOption: 0,
    secondOption: 1,
    pickOneUndervotes: 0,
    ballotsCast: 1,
  })
})

test('counts either option with no selected preference', () => {
  const tally = computeTallyForEitherNeitherContests({
    election,
    tally: zeroTally,
    votes: {
      '420A': ['yes'],
      '420B': [],
    },
    contests: election.contests,
  })

  expect(tally[measure420Index]).toEqual({
    eitherOption: 1,
    neitherOption: 0,
    eitherNeitherUndervotes: 0,
    firstOption: 0,
    secondOption: 0,
    pickOneUndervotes: 1,
    ballotsCast: 1,
  })
})

test('happily counts neither option with no selected preference', () => {
  const tally = computeTallyForEitherNeitherContests({
    election,
    tally: zeroTally,
    votes: {
      '420A': ['no'],
      '420B': [],
    },
    contests: election.contests,
  })

  expect(tally[measure420Index]).toEqual({
    eitherOption: 0,
    neitherOption: 1,
    eitherNeitherUndervotes: 0,
    firstOption: 0,
    secondOption: 0,
    pickOneUndervotes: 1,
    ballotsCast: 1,
  })
})

test('counts missing contests from votes dict as undervotes', () => {
  const tally = computeTallyForEitherNeitherContests({
    election,
    tally: zeroTally,
    votes: {},
    contests: election.contests,
  })

  expect(tally[measure420Index]).toEqual({
    eitherOption: 0,
    neitherOption: 0,
    eitherNeitherUndervotes: 1,
    firstOption: 0,
    secondOption: 0,
    pickOneUndervotes: 1,
    ballotsCast: 1,
  })
})
