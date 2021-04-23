import {
  electionSample,
  multiPartyPrimaryElection,
  electionWithMsEitherNeither,
} from '@votingworks/fixtures'
import { CandidateContest, Dictionary, YesNoContest } from '@votingworks/types'
import { buildCandidateTallies } from '../../test/util/buildCandidateTallies'

import { ContestOptionTally, ContestTally } from '../config/types'
import { expandEitherNeitherContests } from './election'
import {
  combineContestTallies,
  getEmptyExternalTalliesByPrecinct,
  getTotalNumberOfBallots,
} from './externalTallies'

const yesnocontest = electionSample.contests.find(
  (c) => c.id === 'question-a'
) as YesNoContest
const presidentcontest = electionSample.contests.find(
  (c) => c.id === 'president'
) as CandidateContest

describe('combineContestTallies', () => {
  it('combine yes no tallies with an empty tally', () => {
    const tally1 = {
      contest: yesnocontest,
      tallies: {
        yes: { option: ['yes'], tally: 12 },
        no: { option: ['no'], tally: 32 },
      } as Dictionary<ContestOptionTally>,
      metadata: { overvotes: 3, undervotes: 2, ballots: 49 },
    }
    const tally2 = {
      contest: yesnocontest,
      tallies: {
        yes: { option: ['yes'], tally: 0 },
        no: { option: ['no'], tally: 0 },
      } as Dictionary<ContestOptionTally>,
      metadata: { overvotes: 0, undervotes: 0, ballots: 0 },
    }
    expect(combineContestTallies(tally1, tally2)).toStrictEqual(tally1)
  })

  it('combine yes no tallies properly', () => {
    const tally1 = {
      contest: yesnocontest,
      tallies: {
        yes: { option: ['yes'], tally: 12 },
        no: { option: ['no'], tally: 32 },
      } as Dictionary<ContestOptionTally>,
      metadata: { overvotes: 3, undervotes: 2, ballots: 49 },
    }
    const tally2 = {
      contest: yesnocontest,
      tallies: {
        yes: { option: ['yes'], tally: 26 },
        no: { option: ['no'], tally: 32 },
      } as Dictionary<ContestOptionTally>,
      metadata: { overvotes: 1, undervotes: 4, ballots: 63 },
    }
    expect(combineContestTallies(tally1, tally2)).toStrictEqual({
      contest: yesnocontest,
      tallies: {
        yes: { option: ['yes'], tally: 38 },
        no: { option: ['no'], tally: 64 },
      } as Dictionary<ContestOptionTally>,
      metadata: { overvotes: 4, undervotes: 6, ballots: 112 },
    })
  })

  it('combines candidate tally with empty tally properly', () => {
    const tally1 = {
      contest: presidentcontest,
      tallies: buildCandidateTallies(1, presidentcontest),
      metadata: { overvotes: 3, undervotes: 2, ballots: 20 },
    }
    const tally2 = {
      contest: presidentcontest,
      tallies: buildCandidateTallies(0, presidentcontest),
      metadata: { overvotes: 0, undervotes: 0, ballots: 0 },
    }
    expect(combineContestTallies(tally1, tally2)).toStrictEqual(tally1)
  })

  it('combines candidate tally with empty tally properly', () => {
    const tally1 = {
      contest: presidentcontest,
      tallies: buildCandidateTallies(1, presidentcontest),
      metadata: { overvotes: 3, undervotes: 2, ballots: 20 },
    }
    const tally2 = {
      contest: presidentcontest,
      tallies: buildCandidateTallies(2, presidentcontest),
      metadata: { overvotes: 1, undervotes: 1, ballots: 32 },
    }
    expect(combineContestTallies(tally1, tally2)).toStrictEqual({
      contest: presidentcontest,
      tallies: buildCandidateTallies(3, presidentcontest),
      metadata: { overvotes: 4, undervotes: 3, ballots: 52 },
    })
  })

  it('throws error with mismatched contests', () => {
    const tally1 = {
      contest: yesnocontest,
      tallies: {
        yes: { option: ['yes'], tally: 12 },
        no: { option: ['no'], tally: 32 },
      } as Dictionary<ContestOptionTally>,
      metadata: { overvotes: 3, undervotes: 2, ballots: 49 },
    }
    const tally2 = {
      contest: presidentcontest,
      tallies: buildCandidateTallies(2, presidentcontest),
      metadata: { overvotes: 1, undervotes: 1, ballots: 32 },
    }
    expect(() => combineContestTallies(tally1, tally2)).toThrow()
  })
})

describe('getTotalNumberOfBallots', () => {
  it('finds correct number of ballots for an election with 1 contest in all ballot styles', () => {
    const tally1 = {
      contest: presidentcontest,
      tallies: {},
      metadata: { overvotes: 0, undervotes: 0, ballots: 53 },
    }
    const tally2 = {
      contest: yesnocontest,
      tallies: {},
      metadata: { overvotes: 0, undervotes: 0, ballots: 37 },
    }
    const contestTallies = {
      president: tally1,
      'question-a': tally2,
    }
    expect(getTotalNumberOfBallots(contestTallies, electionSample)).toBe(53)
  })

  it('finds correct number of ballots for a primary election with disjoint ballot sets', () => {
    const contestTallies: Dictionary<ContestTally> = {}
    // The follow ballot counts per contest determined based on the following number of votes for each ballot style in the election.
    // 1L: 7, 2L: 12, 3C: 32, 4F: 25, 5F: 18, 6F: 21
    const talliesForContest: Dictionary<number> = {
      'governor-contest-liberty': 19,
      'governor-contest-constitution': 32,
      'governor-contest-federalist': 64,
      'mayor-contest-liberty': 7,
      'assistant-mayor-contest-liberty': 7,
      'mayor-contest-constitution': 32,
      'mayor-contest-federalist': 39,
      'chief-pokemon-liberty': 12,
      'chief-pokemon-constitution': 32,
      'chief-pokemon-federalist': 21,
      'schoolboard-liberty': 12,
      'schoolboard-constitution': 32,
      'schoolboard-federalist': 21,
    }
    multiPartyPrimaryElection.contests.forEach((c) => {
      contestTallies[c.id] = {
        contest: c,
        tallies: {},
        metadata: {
          overvotes: 0,
          undervotes: 0,
          ballots: talliesForContest[c.id]!,
        },
      }
    })

    // The total number of ballots is 115, if you sum up the votes for each ballot style
    // 7 + 12 + 32 + 25 + 18 + 21 you get 115 ballots, or the max of the votes in each disjoint
    // set of contests (each of the three primaries) 19 (liberty) + 32 (constitution) + 64 (federalist) = 115
    expect(
      getTotalNumberOfBallots(contestTallies, multiPartyPrimaryElection)
    ).toBe(115)
  })
})

describe('getEmptyExternalTalliesByPrecinct', () => {
  it('creates empty tallies for primary election', () => {
    const results = getEmptyExternalTalliesByPrecinct(multiPartyPrimaryElection)
    for (const precinct of multiPartyPrimaryElection.precincts) {
      const precinctResults = results[precinct.id]
      expect(precinctResults).toBeDefined()
      expect(precinctResults!.numberOfBallotsCounted).toBe(0)
      for (const contest of expandEitherNeitherContests(
        multiPartyPrimaryElection.contests
      )) {
        const contestTally = precinctResults!.contestTallies[contest.id]
        expect(contestTally).toBeDefined()
        expect(contestTally!.metadata).toStrictEqual({
          ballots: 0,
          undervotes: 0,
          overvotes: 0,
        })
        Object.values(contestTally!.tallies).forEach((tally) => {
          expect(tally!.tally).toBe(0)
        })
      }
    }
  })

  it('creates empty tallies for either neither election', () => {
    const results = getEmptyExternalTalliesByPrecinct(
      electionWithMsEitherNeither
    )
    for (const precinct of electionWithMsEitherNeither.precincts) {
      const precinctResults = results[precinct.id]
      expect(precinctResults).toBeDefined()
      expect(precinctResults!.numberOfBallotsCounted).toBe(0)
      for (const contest of expandEitherNeitherContests(
        electionWithMsEitherNeither.contests
      )) {
        const contestTally = precinctResults!.contestTallies[contest.id]
        expect(contestTally).toBeDefined()
        expect(contestTally!.metadata).toStrictEqual({
          ballots: 0,
          undervotes: 0,
          overvotes: 0,
        })
        Object.values(contestTally!.tallies).forEach((tally) => {
          expect(tally!.tally).toBe(0)
        })
      }
    }
  })
})
