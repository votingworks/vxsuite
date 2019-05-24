import { Election, VotesDict } from './config/types'

import encodeVotes from './votecoding'

import electionSample from './data/electionSample.json'

const election = electionSample as Election

it(`encodes votes correctly`, () => {
  let votes: VotesDict = {}

  // this should yield all 0s
  election.contests.forEach(contest => {
    votes[contest.id] =
      contest.type === 'candidate' ? [contest.candidates[0]] : 'no'
  })

  const expectedString = new Array(election.contests.length).fill(0).join('|')

  expect(encodeVotes(election.contests, votes)).toBe(expectedString)
})
