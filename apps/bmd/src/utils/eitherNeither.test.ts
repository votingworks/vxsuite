import { Election } from '@votingworks/ballot-encoder'

import { computeTallyForEitherNeitherContests } from './eitherNeither'
import { getZeroTally } from './election'

import electionSample from '../data/electionSample.json'

const election = electionSample as Election
const measure420Index = election.contests.findIndex(
  (c) => c.id === 'measure-420'
)
const zeroTally = getZeroTally(election)

test('counts first option without first answer', () => {
  const { tally, contestIds } = computeTallyForEitherNeitherContests({
    election,
    tally: zeroTally,
    votes: {
      '420A': [],
      '420B': ['yes'],
    },
  })

  expect(contestIds).toEqual(['420A', '420B'])
  expect(tally[measure420Index]).toEqual({
    eitherOption: 0,
    neitherOption: 0,
    firstOption: 1,
    secondOption: 0,
  })
})

test('counts second option without first answer', () => {
  const { tally, contestIds } = computeTallyForEitherNeitherContests({
    election,
    tally: zeroTally,
    votes: {
      '420A': [],
      '420B': ['no'],
    },
  })

  expect(contestIds).toEqual(['420A', '420B'])
  expect(tally[measure420Index]).toEqual({
    eitherOption: 0,
    neitherOption: 0,
    firstOption: 0,
    secondOption: 1,
  })
})

test('counts first option with either answer', () => {
  const { tally, contestIds } = computeTallyForEitherNeitherContests({
    election,
    tally: zeroTally,
    votes: {
      '420A': ['yes'],
      '420B': ['yes'],
    },
  })

  expect(contestIds).toEqual(['420A', '420B'])
  expect(tally[measure420Index]).toEqual({
    eitherOption: 1,
    neitherOption: 0,
    firstOption: 1,
    secondOption: 0,
  })
})

test('counts second option with either answer', () => {
  const { tally, contestIds } = computeTallyForEitherNeitherContests({
    election,
    tally: zeroTally,
    votes: {
      '420A': ['yes'],
      '420B': ['no'],
    },
  })

  expect(contestIds).toEqual(['420A', '420B'])
  expect(tally[measure420Index]).toEqual({
    eitherOption: 1,
    neitherOption: 0,
    firstOption: 0,
    secondOption: 1,
  })
})

test('counts first option with neither answer', () => {
  const { tally, contestIds } = computeTallyForEitherNeitherContests({
    election,
    tally: zeroTally,
    votes: {
      '420A': ['no'],
      '420B': ['yes'],
    },
  })

  expect(contestIds).toEqual(['420A', '420B'])
  expect(tally[measure420Index]).toEqual({
    eitherOption: 0,
    neitherOption: 1,
    firstOption: 1,
    secondOption: 0,
  })
})

test('counts second option with neither answer', () => {
  const { tally, contestIds } = computeTallyForEitherNeitherContests({
    election,
    tally: zeroTally,
    votes: {
      '420A': ['no'],
      '420B': ['no'],
    },
  })

  expect(contestIds).toEqual(['420A', '420B'])
  expect(tally[measure420Index]).toEqual({
    eitherOption: 0,
    neitherOption: 1,
    firstOption: 0,
    secondOption: 1,
  })
})

test('refuses to count either option with no selected preference', () => {
  const { tally, contestIds } = computeTallyForEitherNeitherContests({
    election,
    tally: zeroTally,
    votes: {
      '420A': ['yes'],
      '420B': [],
    },
  })

  expect(contestIds).toEqual(['420A', '420B'])
  expect(tally[measure420Index]).toEqual({
    eitherOption: 0,
    neitherOption: 0,
    firstOption: 0,
    secondOption: 0,
  })
})

test('happily counts neither option with no selected preference', () => {
  const { tally, contestIds } = computeTallyForEitherNeitherContests({
    election,
    tally: zeroTally,
    votes: {
      '420A': ['no'],
      '420B': [],
    },
  })

  expect(contestIds).toEqual(['420A', '420B'])
  expect(tally[measure420Index]).toEqual({
    eitherOption: 0,
    neitherOption: 1,
    firstOption: 0,
    secondOption: 0,
  })
})
