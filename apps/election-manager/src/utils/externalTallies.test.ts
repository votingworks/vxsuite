import {
  electionSample,
  multiPartyPrimaryElection,
  electionWithMsEitherNeither,
} from '@votingworks/fixtures'
import {
  CandidateContest,
  Dictionary,
  Election,
  YesNoContest,
} from '@votingworks/types'
import { buildCandidateTallies } from '../../test/util/buildCandidateTallies'

import {
  ContestOptionTally,
  ContestTally,
  ExternalTally,
  ExternalTallySourceType,
  FullElectionExternalTally,
  TallyCategory,
  VotingMethod,
} from '../config/types'
import { expandEitherNeitherContests } from './election'
import {
  combineContestTallies,
  convertExternalTalliesToStorageString,
  convertStorageStringToExternalTallies,
  convertTalliesByPrecinctToFullExternalTally,
  filterExternalTalliesByParams,
  getEmptyContestTallies,
  getEmptyExternalTalliesByPrecinct,
  getEmptyExternalTally,
  getPrecinctIdsInExternalTally,
  getTotalNumberOfBallots,
} from './externalTallies'

const yesnocontest = electionSample.contests.find(
  (c) => c.id === 'question-a'
) as YesNoContest
const presidentcontest = electionSample.contests.find(
  (c) => c.id === 'president'
) as CandidateContest

// Note this helper uses 'getEmptyContestTallies' and 'getTotalNumberOfBallots' util functions so should not be used to test those implementations.
function buildExternalTally(
  election: Election,
  multiplier: number,
  contestIdsToPopulate: string[]
): ExternalTally {
  // Initialize an empty set of contest tallies
  const contestTallies = getEmptyContestTallies(election)
  for (const contestId of contestIdsToPopulate) {
    if (!(contestId in contestTallies)) {
      throw new Error(`Contest ID ${contestId} is not in the provided election`)
    }
    const emptyTally = contestTallies[contestId]!
    const populatedTallies: Dictionary<ContestOptionTally> = {}
    const numSeats =
      emptyTally.contest.type === 'candidate'
        ? (emptyTally.contest as CandidateContest).seats
        : 1
    let numberOfBallotsInContest = 2 * multiplier // Undervotes and Overvotes
    for (const optionId of Object.keys(emptyTally.tallies)) {
      populatedTallies[optionId] = {
        ...emptyTally.tallies[optionId]!,
        tally: 1 * multiplier * numSeats,
      }
      numberOfBallotsInContest += 1 * multiplier
    }
    contestTallies[contestId] = {
      ...emptyTally,
      tallies: populatedTallies,
      metadata: {
        undervotes: 1 * multiplier * numSeats,
        overvotes: 1 * multiplier * numSeats,
        ballots: numberOfBallotsInContest,
      },
    }
  }
  return {
    contestTallies,
    numberOfBallotsCounted: getTotalNumberOfBallots(contestTallies, election),
  }
}

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

describe('convertExternalTalliesToStorageString, convertStorageStringToExternalTallies', () => {
  it('can convert to storage string and back to external tallies', () => {
    const singleVotes = buildExternalTally(electionWithMsEitherNeither, 1, [
      '775020876',
      '750000017',
    ])
    const doubleVotes = buildExternalTally(electionWithMsEitherNeither, 2, [
      '775020876',
      '750000017',
    ])
    const resultsByCategory = new Map()
    resultsByCategory.set(TallyCategory.Precinct, {
      '6522': singleVotes,
      '6524': singleVotes,
    })
    const fullTallySEMS: FullElectionExternalTally = {
      overallTally: doubleVotes,
      resultsByCategory,
      votingMethod: VotingMethod.Absentee,
      source: ExternalTallySourceType.SEMS,
      inputSourceName: 'the-heartbreak-prince',
      timestampCreated: new Date(1989, 11, 13),
    } // Have information both in the main tally and results by category

    const storageString = convertExternalTalliesToStorageString([fullTallySEMS])
    const recreatedTallies = convertStorageStringToExternalTallies(
      storageString
    )
    expect(recreatedTallies).toStrictEqual([fullTallySEMS])

    // Test with multiple external tallies.
    const fullTallyManual: FullElectionExternalTally = {
      overallTally: singleVotes,
      resultsByCategory: new Map(),
      votingMethod: VotingMethod.Precinct,
      source: ExternalTallySourceType.Manual,
      inputSourceName: 'call-it-what-you-want',
      timestampCreated: new Date(2013, 1, 3),
    }

    const storageString2 = convertExternalTalliesToStorageString([
      fullTallySEMS,
      fullTallyManual,
    ])
    const recreatedTallies2 = convertStorageStringToExternalTallies(
      storageString2
    )
    expect(recreatedTallies2).toStrictEqual([fullTallySEMS, fullTallyManual])
  })
})

describe('getPrecinctIdsInExternalTally', () => {
  it('returns nothing if there are no results by precinct computed', () => {
    const emptyFullExternalTally: FullElectionExternalTally = {
      overallTally: getEmptyExternalTally(),
      resultsByCategory: new Map(),
      votingMethod: VotingMethod.Precinct,
      source: ExternalTallySourceType.Manual,
      inputSourceName: 'call-it-what-you-want',
      timestampCreated: new Date(1989, 11, 13),
    }
    expect(getPrecinctIdsInExternalTally(emptyFullExternalTally)).toStrictEqual(
      []
    )
  })

  it('returns a subset of precincts with nonzero ballot totals', () => {
    const singleVotes = buildExternalTally(electionWithMsEitherNeither, 1, [
      '775020876',
      '750000017',
    ])
    const emptyVotes = buildExternalTally(electionWithMsEitherNeither, 0, [])
    const resultsByCategory = new Map()
    resultsByCategory.set(TallyCategory.Precinct, {
      '6522': singleVotes,
      '6524': emptyVotes,
      '6527': singleVotes,
      '6532': emptyVotes,
    })
    const fullExternalTally: FullElectionExternalTally = {
      overallTally: getEmptyExternalTally(),
      resultsByCategory,
      votingMethod: VotingMethod.Precinct,
      source: ExternalTallySourceType.Manual,
      inputSourceName: 'call-it-what-you-want',
      timestampCreated: new Date(1989, 11, 13),
    }
    // Precincts with 0 votes explictly specified or just missing in the dictionary are not included
    expect(getPrecinctIdsInExternalTally(fullExternalTally)).toStrictEqual([
      '6522',
      '6527',
    ])
  })
})

describe('filterExternalTalliesByParams', () => {
  const emptyVotesEitherNeither = buildExternalTally(
    electionWithMsEitherNeither,
    1,
    ['775020876', '750000017']
  )
  const singleVotesEitherNeither = buildExternalTally(
    electionWithMsEitherNeither,
    1,
    ['775020876', '750000017']
  )
  const doubleVotesEitherNeither = buildExternalTally(
    electionWithMsEitherNeither,
    2,
    ['775020876', '750000017']
  )
  const resultsByCategory = new Map()
  resultsByCategory.set(TallyCategory.Precinct, {
    '6522': singleVotesEitherNeither,
    '6524': singleVotesEitherNeither,
    '6529': emptyVotesEitherNeither,
  })
  const fullTallySEMS: FullElectionExternalTally = {
    overallTally: doubleVotesEitherNeither,
    resultsByCategory,
    votingMethod: VotingMethod.Absentee,
    source: ExternalTallySourceType.SEMS,
    inputSourceName: 'the-heartbreak-prince',
    timestampCreated: new Date(1989, 11, 13),
  }
  it('returns undefined when the inputted tally is undefined', () => {
    expect(
      filterExternalTalliesByParams(undefined, electionWithMsEitherNeither, {})
    ).toBe(undefined)
  })
  it('returns undefined when filtering by an unsupported parameter', () => {
    expect(
      filterExternalTalliesByParams(
        fullTallySEMS,
        electionWithMsEitherNeither,
        { scannerId: '1' }
      )
    ).toBe(undefined)
  })

  it('returns an empty tally when filtering for a different voting method', () => {
    expect(
      filterExternalTalliesByParams(
        fullTallySEMS,
        electionWithMsEitherNeither,
        { votingMethod: VotingMethod.Precinct }
      )
    ).toStrictEqual(getEmptyExternalTally())
  })

  it('returns the current tally when filtering for a matching voting method', () => {
    expect(
      filterExternalTalliesByParams(
        fullTallySEMS,
        electionWithMsEitherNeither,
        { votingMethod: VotingMethod.Absentee }
      )
    ).toStrictEqual(doubleVotesEitherNeither)
  })

  it('filters by precinct as expected', () => {
    expect(
      filterExternalTalliesByParams(
        fullTallySEMS,
        electionWithMsEitherNeither,
        { precinctId: '6524' }
      )
    ).toStrictEqual(singleVotesEitherNeither)

    expect(
      filterExternalTalliesByParams(
        fullTallySEMS,
        electionWithMsEitherNeither,
        { precinctId: '6524', votingMethod: VotingMethod.Absentee }
      )
    ).toStrictEqual(singleVotesEitherNeither)

    expect(
      filterExternalTalliesByParams(
        fullTallySEMS,
        electionWithMsEitherNeither,
        { precinctId: '6524', votingMethod: VotingMethod.Precinct }
      )
    ).toStrictEqual(getEmptyExternalTally())

    expect(
      filterExternalTalliesByParams(
        fullTallySEMS,
        electionWithMsEitherNeither,
        { precinctId: '6529' }
      )
    ).toStrictEqual(emptyVotesEitherNeither)
    expect(
      filterExternalTalliesByParams(
        fullTallySEMS,
        electionWithMsEitherNeither,
        { precinctId: '6529', votingMethod: VotingMethod.Absentee }
      )
    ).toStrictEqual(emptyVotesEitherNeither)
    expect(
      filterExternalTalliesByParams(
        fullTallySEMS,
        electionWithMsEitherNeither,
        { precinctId: '6537' }
      )
    ).toStrictEqual(getEmptyExternalTally())
  })

  it('filters by party as expected', () => {
    const singleVotesPrimary = buildExternalTally(
      multiPartyPrimaryElection,
      1,
      [
        'governor-contest-liberty',
        'mayor-contest-liberty',
        'governor-contest-constitution',
        'governor-contest-federalist',
      ]
    )
    const fullTallySEMS: FullElectionExternalTally = {
      overallTally: singleVotesPrimary,
      resultsByCategory: new Map(),
      votingMethod: VotingMethod.Absentee,
      source: ExternalTallySourceType.SEMS,
      inputSourceName: 'the-heartbreak-prince',
      timestampCreated: new Date(1989, 11, 13),
    }
    const libertyResults = filterExternalTalliesByParams(
      fullTallySEMS,
      multiPartyPrimaryElection,
      {
        partyId: '0', // Liberty
      }
    )
    expect(
      libertyResults?.contestTallies['governor-contest-liberty']
    ).toStrictEqual(
      singleVotesPrimary.contestTallies['governor-contest-liberty']
    )
    expect(
      libertyResults?.contestTallies['mayor-contest-liberty']
    ).toStrictEqual(singleVotesPrimary.contestTallies['mayor-contest-liberty'])
    expect(libertyResults?.contestTallies).not.toHaveProperty(
      'governor-contest-constitution'
    )
    expect(libertyResults?.contestTallies).not.toHaveProperty(
      'governor-contest-federalist'
    )

    const constitutionResults = filterExternalTalliesByParams(
      fullTallySEMS,
      multiPartyPrimaryElection,
      {
        partyId: '3', // Constitution
      }
    )
    expect(
      constitutionResults?.contestTallies['governor-contest-constitution']
    ).toStrictEqual(
      singleVotesPrimary.contestTallies['governor-contest-constitution']
    )
    expect(constitutionResults?.contestTallies).not.toHaveProperty(
      'governor-contest-liberty'
    )
    expect(constitutionResults?.contestTallies).not.toHaveProperty(
      'mayor-contest-liberty'
    )
    expect(constitutionResults?.contestTallies).not.toHaveProperty(
      'governor-contest-federalist'
    )
    const federalistResults = filterExternalTalliesByParams(
      fullTallySEMS,
      multiPartyPrimaryElection,
      {
        partyId: '4', // Federalist
      }
    )
    expect(
      federalistResults?.contestTallies['governor-contest-federalist']
    ).toStrictEqual(
      singleVotesPrimary.contestTallies['governor-contest-federalist']
    )
    expect(federalistResults?.contestTallies).not.toHaveProperty(
      'governor-contest-constitution'
    )
    expect(federalistResults?.contestTallies).not.toHaveProperty(
      'mayor-contest-liberty'
    )
    expect(federalistResults?.contestTallies).not.toHaveProperty(
      'governor-contest-liberty'
    )

    // Filtering by voting method with party works as expected
    expect(
      filterExternalTalliesByParams(fullTallySEMS, multiPartyPrimaryElection, {
        partyId: '4', // Federalist
        votingMethod: VotingMethod.Precinct,
      })
    ).toStrictEqual(getEmptyExternalTally())
    expect(
      filterExternalTalliesByParams(fullTallySEMS, multiPartyPrimaryElection, {
        partyId: '4', // Federalist
        votingMethod: VotingMethod.Absentee,
      })
    ).toStrictEqual(federalistResults)

    // Filtering by precinct voting method and party works as expected
    const doubleVotesPrimary = buildExternalTally(
      multiPartyPrimaryElection,
      2,
      [
        'governor-contest-liberty',
        'mayor-contest-liberty',
        'governor-contest-constitution',
        'governor-contest-federalist',
      ]
    )
    const resultsByCategory = new Map()
    resultsByCategory.set(TallyCategory.Precinct, {
      'precinct-1': singleVotesPrimary,
      'precinct-2': singleVotesPrimary,
    })
    const fullTallyManual: FullElectionExternalTally = {
      overallTally: doubleVotesPrimary,
      resultsByCategory,
      votingMethod: VotingMethod.Precinct,
      source: ExternalTallySourceType.Manual,
      inputSourceName: 'the-heartbreak-prince',
      timestampCreated: new Date(1989, 11, 13),
    }
    const precinct1Liberty = filterExternalTalliesByParams(
      fullTallyManual,
      multiPartyPrimaryElection,
      {
        precinctId: 'precinct-1',
        partyId: '0',
        votingMethod: VotingMethod.Precinct,
      }
    )
    expect(precinct1Liberty).toStrictEqual(libertyResults)
    const precinct3Liberty = filterExternalTalliesByParams(
      fullTallyManual,
      multiPartyPrimaryElection,
      {
        precinctId: 'precinct-3',
        partyId: '0',
        votingMethod: VotingMethod.Precinct,
      }
    )
    expect(precinct3Liberty).toStrictEqual(getEmptyExternalTally())
  })
})

describe('convertTalliesByPrecinctToFullExternalTally', () => {
  it('combines precincts as expected', () => {
    // Contests to populate for the purposes of these tests.
    const contestIds = [
      'governor-contest-liberty',
      'mayor-contest-liberty',
      'governor-contest-constitution',
      'governor-contest-federalist',
    ]
    const emptyVotesPrimary = buildExternalTally(
      multiPartyPrimaryElection,
      0,
      contestIds
    )
    const singleVotesPrimary = buildExternalTally(
      multiPartyPrimaryElection,
      1,
      contestIds
    )
    const doubleVotesPrimary = buildExternalTally(
      multiPartyPrimaryElection,
      2,
      contestIds
    )
    const resultsByPrecinct = {
      'precinct-1': singleVotesPrimary,
      'precinct-2': singleVotesPrimary,
      'precinct-3': doubleVotesPrimary,
      'precinct-4': doubleVotesPrimary,
      'precinct-5': emptyVotesPrimary,
    }
    const results = convertTalliesByPrecinctToFullExternalTally(
      resultsByPrecinct,
      multiPartyPrimaryElection,
      VotingMethod.Absentee,
      ExternalTallySourceType.SEMS,
      'one-single-thread-of-gold',
      new Date(2020, 3, 1)
    )
    expect(results.overallTally).toStrictEqual(
      buildExternalTally(multiPartyPrimaryElection, 6, contestIds)
    )
    expect(results.votingMethod).toBe(VotingMethod.Absentee)
    expect(results.source).toBe(ExternalTallySourceType.SEMS)
    expect(results.inputSourceName).toBe('one-single-thread-of-gold')
    expect(results.timestampCreated).toStrictEqual(new Date(2020, 3, 1))
    expect([...results.resultsByCategory.keys()]).toStrictEqual([
      TallyCategory.Precinct,
      TallyCategory.Party,
    ])
    expect(results.resultsByCategory.get(TallyCategory.Precinct)).toStrictEqual(
      resultsByPrecinct
    )
    const resultsByParty = results.resultsByCategory.get(TallyCategory.Party)
    expect(resultsByParty).toStrictEqual({
      '0': filterExternalTalliesByParams(results, multiPartyPrimaryElection, {
        partyId: '0',
      }),
      '3': filterExternalTalliesByParams(results, multiPartyPrimaryElection, {
        partyId: '3',
      }),
      '4': filterExternalTalliesByParams(results, multiPartyPrimaryElection, {
        partyId: '4',
      }),
    })
  })
})
